import Capacitor
import Foundation

private let responseChunkBytes = 16 * 1024

@objc(StreamingHttpPlugin)
public class StreamingHttpPlugin: CAPPlugin, CAPBridgedPlugin, URLSessionDataDelegate {
  public let identifier = "StreamingHttpPlugin"
  public let jsName = "StreamingHttp"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
  ]

  private let requestsLock = NSLock()
  private let workerQueue = DispatchQueue(
    label: "com.vlaina.streaming-http",
    qos: .userInitiated,
    attributes: .concurrent
  )
  private var requests: [String: ActiveStreamingRequest] = [:]

  @objc public func start(_ call: CAPPluginCall) {
    let options: StreamingHttpOptions
    do {
      options = try StreamingHttpOptions.read(from: call)
    } catch {
      call.reject(error.localizedDescription, nil, error)
      return
    }

    let active = ActiveStreamingRequest()
    requestsLock.lock()
    let duplicate = requests[options.id] != nil
    if !duplicate { requests[options.id] = active }
    requestsLock.unlock()
    guard !duplicate else {
      call.reject("Native HTTP request ID is already active.")
      return
    }

    call.resolve()
    workerQueue.async { [weak self] in
      self?.begin(options, active: active)
    }
  }

  @objc public func cancel(_ call: CAPPluginCall) {
    guard let id = call.getString("id"), !id.isEmpty else {
      call.reject("Native HTTP request ID is required.")
      return
    }
    removeRequest(id)?.cancel()
    call.resolve()
  }

  private func begin(_ options: StreamingHttpOptions, active: ActiveStreamingRequest) {
    do {
      let request = try options.makeRequest()
      if active.isCancelled {
        _ = removeRequest(options.id, matching: active)
        return
      }
      let delegateQueue = OperationQueue()
      delegateQueue.maxConcurrentOperationCount = 1
      delegateQueue.qualityOfService = .userInitiated
      let session = URLSession(
        configuration: options.makeSessionConfiguration(),
        delegate: self,
        delegateQueue: delegateQueue
      )
      let task = session.dataTask(with: request)
      task.taskDescription = options.id
      guard active.attach(session: session, task: task) else {
        _ = removeRequest(options.id, matching: active)
        return
      }
      task.resume()
    } catch {
      if !active.isCancelled {
        emitError(options.id, message: safeErrorMessage(error))
      }
      _ = removeRequest(options.id, matching: active)
      active.finish()
    }
  }

  public func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let id = dataTask.taskDescription,
          let active = request(id),
          !active.isCancelled,
          let httpResponse = response as? HTTPURLResponse else {
      completionHandler(.cancel)
      return
    }
    active.markResponseReceived()
    notifyListeners("response", data: [
      "id": id,
      "status": httpResponse.statusCode,
      "statusText": "",
      "headers": StreamingHttpOptions.responseHeaders(httpResponse)
    ])
    completionHandler(.allow)
  }

  public func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  public func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive data: Data
  ) {
    guard let id = dataTask.taskDescription,
          let active = request(id),
          !active.isCancelled else { return }
    guard active.addReceivedBytes(data.count) else {
      emitError(id, message: "Native HTTP response body is too large.")
      _ = removeRequest(id, matching: active)
      active.cancel()
      return
    }
    for offset in stride(from: 0, to: data.count, by: responseChunkBytes) {
      guard !active.isCancelled else { return }
      let end = min(offset + responseChunkBytes, data.count)
      notifyListeners("chunk", data: [
        "id": id,
        "dataBase64": data.subdata(in: offset..<end).base64EncodedString()
      ])
    }
  }

  public func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard let id = task.taskDescription,
          let active = removeRequest(id) else { return }
    defer { active.finish() }
    if active.isCancelled { return }
    if let error {
      emitError(id, message: safeErrorMessage(error))
    } else if active.didReceiveResponse {
      notifyListeners("end", data: ["id": id])
    } else {
      emitError(id, message: "Native HTTP ended before response metadata.")
    }
  }

  private func emitError(_ id: String, message: String) {
    notifyListeners("error", data: ["id": id, "message": message])
  }

  private func safeErrorMessage(_ error: Error) -> String {
    let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    return message.isEmpty || message.count > 1_024
      ? "Native HTTP request failed."
      : message
  }

  private func request(_ id: String) -> ActiveStreamingRequest? {
    requestsLock.lock()
    defer { requestsLock.unlock() }
    return requests[id]
  }

  private func removeRequest(
    _ id: String,
    matching expected: ActiveStreamingRequest? = nil
  ) -> ActiveStreamingRequest? {
    requestsLock.lock()
    defer { requestsLock.unlock() }
    guard let active = requests[id], expected == nil || active === expected else { return nil }
    requests.removeValue(forKey: id)
    return active
  }

  deinit {
    requestsLock.lock()
    let activeRequests = Array(requests.values)
    requests.removeAll()
    requestsLock.unlock()
    activeRequests.forEach { $0.cancel() }
  }
}

private final class ActiveStreamingRequest {
  private let lock = NSLock()
  private var cancelled = false
  private var responseReceived = false
  private var receivedBytes = 0
  private var session: URLSession?
  private var task: URLSessionDataTask?

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  var didReceiveResponse: Bool {
    lock.lock()
    defer { lock.unlock() }
    return responseReceived
  }

  func attach(session: URLSession, task: URLSessionDataTask) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard !cancelled else {
      task.cancel()
      session.invalidateAndCancel()
      return false
    }
    self.session = session
    self.task = task
    return true
  }

  func markResponseReceived() {
    lock.lock()
    responseReceived = true
    lock.unlock()
  }

  func addReceivedBytes(_ count: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    receivedBytes += count
    return receivedBytes <= StreamingHttpOptions.maxBodyBytes
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let currentTask = task
    let currentSession = session
    task = nil
    session = nil
    lock.unlock()
    currentTask?.cancel()
    currentSession?.invalidateAndCancel()
  }

  func finish() {
    lock.lock()
    let currentSession = session
    task = nil
    session = nil
    lock.unlock()
    currentSession?.finishTasksAndInvalidate()
  }
}
