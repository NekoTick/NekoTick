package com.vlaina.plugins.streaminghttp;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

final class StreamingHttpRequestOptions {
    static final long MAX_BODY_BYTES = 64L * 1024L * 1024L;
    private static final long MAX_BASE64_CHARS = ((MAX_BODY_BYTES + 2L) / 3L) * 4L;
    private static final int DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
    private static final int DEFAULT_READ_TIMEOUT_MS = 300_000;
    private static final int MAX_TIMEOUT_MS = 600_000;

    final String id;
    final String url;
    final String method;
    final Map<String, String> headers;
    final String body;
    final String bodyBase64;
    final boolean includeCookies;
    final int readTimeoutMs;

    private StreamingHttpRequestOptions(
        String id,
        String url,
        String method,
        Map<String, String> headers,
        String body,
        String bodyBase64,
        boolean includeCookies,
        int readTimeoutMs
    ) {
        this.id = id;
        this.url = url;
        this.method = method;
        this.headers = headers;
        this.body = body;
        this.bodyBase64 = bodyBase64;
        this.includeCookies = includeCookies;
        this.readTimeoutMs = readTimeoutMs;
    }

    static StreamingHttpRequestOptions fromCall(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        String method = call.getString("method", "GET").toUpperCase(Locale.ROOT);
        if (id == null || id.isEmpty() || id.length() > 160) {
            throw new IllegalArgumentException("Invalid native HTTP request ID.");
        }
        validateUrl(url);
        if (!method.equals("GET") && !method.equals("POST")) {
            throw new IllegalArgumentException("Unsupported native HTTP method.");
        }

        String body = call.getString("body");
        String bodyBase64 = call.getString("bodyBase64");
        if (body != null && bodyBase64 != null) {
            throw new IllegalArgumentException("Native HTTP request has multiple bodies.");
        }
        return new StreamingHttpRequestOptions(
            id,
            url,
            method,
            readHeaders(call.getObject("headers", new JSObject())),
            body,
            bodyBase64,
            call.getBoolean("includeCookies", false),
            readTimeout(call, "readTimeoutMs", DEFAULT_READ_TIMEOUT_MS)
        );
    }

    OkHttpClient createClient(OkHttpClient baseClient) {
        OkHttpClient.Builder builder = baseClient.newBuilder()
            .connectTimeout(DEFAULT_CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(readTimeoutMs, TimeUnit.MILLISECONDS);
        if (includeCookies) builder.addNetworkInterceptor(new WebViewCookieInterceptor());
        return builder.build();
    }

    Request createRequest() {
        Request.Builder builder = new Request.Builder().url(url);
        for (Map.Entry<String, String> header : headers.entrySet()) {
            if (!isRestrictedRequestHeader(header.getKey())) {
                builder.header(header.getKey(), header.getValue());
            }
        }
        RequestBody requestBody = null;
        if (method.equals("POST")) {
            byte[] bytes = readBodyBytes();
            String contentType = findHeader("content-type");
            MediaType mediaType = contentType == null ? null : MediaType.parse(contentType);
            requestBody = RequestBody.create(bytes, mediaType);
        }
        return builder.method(method, requestBody).build();
    }

    static JSObject responseHeaders(Response response) {
        JSObject output = new JSObject();
        for (String name : response.headers().names()) {
            if (name.equalsIgnoreCase("set-cookie") || name.equalsIgnoreCase("set-cookie2")) continue;
            List<String> values = response.headers(name);
            output.put(name.toLowerCase(Locale.ROOT), String.join(", ", values));
        }
        return output;
    }

    private byte[] readBodyBytes() {
        byte[] bytes;
        if (bodyBase64 != null) {
            if (bodyBase64.length() > MAX_BASE64_CHARS) throw bodyTooLarge();
            try {
                bytes = Base64.decode(bodyBase64, Base64.DEFAULT);
            } catch (IllegalArgumentException error) {
                throw new IllegalArgumentException("Native HTTP request body is invalid.", error);
            }
        } else {
            bytes = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
        }
        if (bytes.length > MAX_BODY_BYTES) throw bodyTooLarge();
        return bytes;
    }

    private String findHeader(String target) {
        for (Map.Entry<String, String> header : headers.entrySet()) {
            if (header.getKey().equalsIgnoreCase(target)) return header.getValue();
        }
        return null;
    }

    private static Map<String, String> readHeaders(JSObject source) {
        Map<String, String> headers = new HashMap<>();
        Iterator<String> keys = source.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = source.getString(key);
            if (value != null) headers.put(key, value);
        }
        return headers;
    }

    private static int readTimeout(PluginCall call, String key, int fallback) {
        Integer value = call.getInt(key);
        if (value == null) return fallback;
        if (value < 1 || value > MAX_TIMEOUT_MS) {
            throw new IllegalArgumentException("Invalid native HTTP timeout.");
        }
        return value;
    }

    private static void validateUrl(String value) {
        try {
            URI uri = URI.create(value == null ? "" : value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null) {
                throw new IllegalArgumentException("Native AI requests require an HTTPS URL.");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Native AI requests require an HTTPS URL.", error);
        }
    }

    private static boolean isRestrictedRequestHeader(String name) {
        return name.equalsIgnoreCase("cookie")
            || name.equalsIgnoreCase("cookie2")
            || name.equalsIgnoreCase("content-length")
            || name.equalsIgnoreCase("connection")
            || name.equalsIgnoreCase("host")
            || name.equalsIgnoreCase("transfer-encoding");
    }

    private static IllegalArgumentException bodyTooLarge() {
        return new IllegalArgumentException("Native HTTP request body is too large.");
    }
}
