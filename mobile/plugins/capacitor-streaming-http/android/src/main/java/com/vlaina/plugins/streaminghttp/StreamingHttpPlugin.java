package com.vlaina.plugins.streaminghttp;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "StreamingHttp")
public class StreamingHttpPlugin extends Plugin {
    private static final int CHUNK_BYTES = 16 * 1024;
    private final Map<String, ActiveRequest> activeRequests = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final OkHttpClient baseClient = new OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .build();

    @PluginMethod
    public void start(PluginCall call) {
        final StreamingHttpRequestOptions options;
        try {
            options = StreamingHttpRequestOptions.fromCall(call);
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error);
            return;
        }

        ActiveRequest request = new ActiveRequest();
        if (activeRequests.putIfAbsent(options.id, request) != null) {
            call.reject("Native HTTP request ID is already active.");
            return;
        }
        try {
            executor.execute(() -> execute(options, request));
            call.resolve();
        } catch (RejectedExecutionException error) {
            activeRequests.remove(options.id, request);
            call.reject("Native HTTP transport is unavailable.", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("Native HTTP request ID is required.");
            return;
        }
        ActiveRequest request = activeRequests.remove(id);
        if (request != null) request.cancel();
        call.resolve();
    }

    private void execute(StreamingHttpRequestOptions options, ActiveRequest active) {
        try {
            if (active.isCancelled()) return;
            OkHttpClient client = options.createClient(baseClient);
            Call nativeCall = client.newCall(options.createRequest());
            active.attach(nativeCall);
            if (active.isCancelled()) return;

            try (Response response = nativeCall.execute()) {
                if (active.isCancelled()) return;
                emitResponse(options.id, response);
                streamBody(options.id, response.body(), active);
            }
        } catch (Exception error) {
            if (!active.isCancelled()) emitError(options.id, errorMessage(error));
        } finally {
            activeRequests.remove(options.id, active);
        }
    }

    private void streamBody(String id, ResponseBody body, ActiveRequest active) throws IOException {
        if (body == null) {
            if (!active.isCancelled()) emitEnd(id);
            return;
        }
        long contentLength = body.contentLength();
        if (contentLength > StreamingHttpRequestOptions.MAX_BODY_BYTES) {
            emitError(id, "Native HTTP response body is too large.");
            active.cancel();
            return;
        }

        byte[] buffer = new byte[CHUNK_BYTES];
        long received = 0;
        try (InputStream input = body.byteStream()) {
            int count;
            while (!active.isCancelled() && (count = input.read(buffer)) != -1) {
                received += count;
                if (received > StreamingHttpRequestOptions.MAX_BODY_BYTES) {
                    emitError(id, "Native HTTP response body is too large.");
                    active.cancel();
                    return;
                }
                JSObject event = event(id);
                event.put("dataBase64", Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP));
                notifyListeners("chunk", event);
            }
        }
        if (!active.isCancelled()) emitEnd(id);
    }

    private void emitResponse(String id, Response response) {
        JSObject event = event(id);
        event.put("status", response.code());
        event.put("statusText", response.message());
        event.put("headers", StreamingHttpRequestOptions.responseHeaders(response));
        notifyListeners("response", event);
    }

    private void emitEnd(String id) {
        notifyListeners("end", event(id));
    }

    private void emitError(String id, String message) {
        JSObject event = event(id);
        event.put("message", message);
        notifyListeners("error", event);
    }

    private static JSObject event(String id) {
        JSObject event = new JSObject();
        event.put("id", id);
        return event;
    }

    private static String errorMessage(Exception error) {
        String message = error.getLocalizedMessage();
        if (message == null || message.isBlank() || message.length() > 1024) {
            return "Native HTTP request failed.";
        }
        return message;
    }

    @Override
    protected void handleOnDestroy() {
        for (ActiveRequest request : activeRequests.values()) request.cancel();
        activeRequests.clear();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private static final class ActiveRequest {
        private final AtomicBoolean cancelled = new AtomicBoolean(false);
        private volatile Call nativeCall;

        void attach(Call call) {
            nativeCall = call;
            if (cancelled.get()) call.cancel();
        }

        void cancel() {
            cancelled.set(true);
            Call call = nativeCall;
            if (call != null) call.cancel();
        }

        boolean isCancelled() {
            return cancelled.get();
        }
    }
}
