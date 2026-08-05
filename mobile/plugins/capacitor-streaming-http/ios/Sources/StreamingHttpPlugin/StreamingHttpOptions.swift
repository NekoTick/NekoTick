import Capacitor
import Foundation

struct StreamingHttpOptions {
  static let maxBodyBytes = 64 * 1024 * 1024
  private static let maxBase64Characters = ((maxBodyBytes + 2) / 3) * 4
  private static let maximumTimeoutMs = 600_000

  let id: String
  let url: URL
  let method: String
  let headers: [String: String]
  let body: String?
  let bodyBase64: String?
  let includeCookies: Bool
  let readTimeoutMs: Int

  static func read(from call: CAPPluginCall) throws -> StreamingHttpOptions {
    guard let id = call.getString("id"), !id.isEmpty, id.count <= 160 else {
      throw StreamingHttpError.invalidRequestId
    }
    guard let urlString = call.getString("url"),
          let components = URLComponents(string: urlString),
          components.scheme?.lowercased() == "https",
          components.host != nil,
          components.user == nil,
          components.password == nil,
          let url = components.url else {
      throw StreamingHttpError.invalidURL
    }
    let method = (call.getString("method") ?? "GET").uppercased()
    guard method == "GET" || method == "POST" else {
      throw StreamingHttpError.unsupportedMethod
    }

    let body = call.getString("body")
    let bodyBase64 = call.getString("bodyBase64")
    guard body == nil || bodyBase64 == nil else {
      throw StreamingHttpError.multipleBodies
    }
    return StreamingHttpOptions(
      id: id,
      url: url,
      method: method,
      headers: readHeaders(call.getObject("headers") ?? [:]),
      body: body,
      bodyBase64: bodyBase64,
      includeCookies: call.getBool("includeCookies") ?? false,
      readTimeoutMs: try readTimeout(call, key: "readTimeoutMs", fallback: 300_000)
    )
  }

  func makeRequest() throws -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = TimeInterval(readTimeoutMs) / 1_000
    for (name, value) in headers where !Self.isRestrictedRequestHeader(name) {
      request.setValue(value, forHTTPHeaderField: name)
    }
    if method == "POST" {
      request.httpBody = try bodyData()
    }
    return request
  }

  func makeSessionConfiguration() -> URLSessionConfiguration {
    let configuration = includeCookies ? URLSessionConfiguration.default : .ephemeral
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    configuration.waitsForConnectivity = true
    configuration.allowsConstrainedNetworkAccess = true
    configuration.allowsExpensiveNetworkAccess = true
    configuration.timeoutIntervalForRequest = TimeInterval(readTimeoutMs) / 1_000
    configuration.timeoutIntervalForResource = TimeInterval(readTimeoutMs) / 1_000
    configuration.httpShouldSetCookies = includeCookies
    configuration.httpCookieStorage = includeCookies ? .shared : nil
    return configuration
  }

  static func responseHeaders(_ response: HTTPURLResponse) -> [String: String] {
    var headers: [String: String] = [:]
    for (key, value) in response.allHeaderFields {
      let name = String(describing: key).lowercased()
      if name == "set-cookie" || name == "set-cookie2" { continue }
      headers[name] = String(describing: value)
    }
    return headers
  }

  private func bodyData() throws -> Data {
    let data: Data
    if let bodyBase64 {
      guard bodyBase64.count <= Self.maxBase64Characters,
            let decoded = Data(base64Encoded: bodyBase64) else {
        throw bodyBase64.count > Self.maxBase64Characters
          ? StreamingHttpError.requestBodyTooLarge
          : StreamingHttpError.invalidRequestBody
      }
      data = decoded
    } else {
      data = Data((body ?? "").utf8)
    }
    guard data.count <= Self.maxBodyBytes else {
      throw StreamingHttpError.requestBodyTooLarge
    }
    return data
  }

  private static func readHeaders(_ source: JSObject) -> [String: String] {
    var headers: [String: String] = [:]
    for (key, value) in source {
      if let stringValue = value as? String { headers[key] = stringValue }
    }
    return headers
  }

  private static func readTimeout(_ call: CAPPluginCall, key: String, fallback: Int) throws -> Int {
    let value = call.getInt(key) ?? fallback
    guard value > 0, value <= maximumTimeoutMs else {
      throw StreamingHttpError.invalidTimeout
    }
    return value
  }

  private static func isRestrictedRequestHeader(_ name: String) -> Bool {
    switch name.lowercased() {
    case "cookie", "cookie2", "content-length", "connection", "host", "transfer-encoding":
      return true
    default:
      return false
    }
  }
}

enum StreamingHttpError: LocalizedError {
  case invalidRequestId
  case invalidURL
  case unsupportedMethod
  case multipleBodies
  case invalidTimeout
  case invalidRequestBody
  case requestBodyTooLarge

  var errorDescription: String? {
    switch self {
    case .invalidRequestId: return "Invalid native HTTP request ID."
    case .invalidURL: return "Native AI requests require an HTTPS URL."
    case .unsupportedMethod: return "Unsupported native HTTP method."
    case .multipleBodies: return "Native HTTP request has multiple bodies."
    case .invalidTimeout: return "Invalid native HTTP timeout."
    case .invalidRequestBody: return "Native HTTP request body is invalid."
    case .requestBodyTooLarge: return "Native HTTP request body is too large."
    }
  }
}
