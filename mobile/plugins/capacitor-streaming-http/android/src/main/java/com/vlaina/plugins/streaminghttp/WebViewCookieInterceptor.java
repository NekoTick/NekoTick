package com.vlaina.plugins.streaminghttp;

import android.webkit.CookieManager;
import java.io.IOException;
import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;

final class WebViewCookieInterceptor implements Interceptor {
    @Override
    public Response intercept(Chain chain) throws IOException {
        CookieManager cookieManager = CookieManager.getInstance();
        Request request = chain.request();
        String url = request.url().toString();
        String cookies = cookieManager.getCookie(url);
        Request.Builder requestBuilder = request.newBuilder().removeHeader("Cookie");
        if (cookies != null && !cookies.isBlank()) requestBuilder.header("Cookie", cookies);

        Response response = chain.proceed(requestBuilder.build());
        for (String cookie : response.headers("Set-Cookie")) {
            cookieManager.setCookie(url, cookie);
        }
        cookieManager.flush();
        return response;
    }
}
