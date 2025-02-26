package com.vernu.smsmodified.activities;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.vernu.smsmodified.AppConstants;
import com.vernu.smsmodified.dtos.GetConfigDTO;
import com.vernu.smsmodified.dtos.RegisterDeviceResponseDTO;
import com.vernu.smsmodified.dtos.SendLogDTO;
import com.vernu.smsmodified.ApiManager;
import com.vernu.smsmodified.helpers.SharedPreferenceHelper;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;
import org.json.JSONException;
import org.json.JSONObject;

public class StartPythonServerWorker extends Worker {
    private Context mContext;
    private String deviceId = null;
    private String username = null;
    private String password = null;
    private String port = null;
    private static final String TAG = "StartPythonServerWorker";
    private Handler mainHandler;
    private WebView webView;
    private volatile boolean isRunning = true;

    public StartPythonServerWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
        mContext = getApplicationContext();
        deviceId = SharedPreferenceHelper.getSharedPreferenceString(mContext, AppConstants.SHARED_PREFS_DEVICE_ID_KEY, "");
        mainHandler = new Handler(Looper.getMainLooper());
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            GetConfigDTO configDTO = new GetConfigDTO();
            configDTO.setDeviceId(deviceId);
            Call<RegisterDeviceResponseDTO> apiConfigCall = ApiManager.getApiService().getConfig(configDTO);
            Log.d(TAG, "FETCHING CONFIG");
            apiConfigCall.enqueue(new Callback<RegisterDeviceResponseDTO>() {
                @Override
                public void onResponse(Call<RegisterDeviceResponseDTO> call, Response<RegisterDeviceResponseDTO> response) {
                    if (!response.isSuccessful()) {
                        return;
                    }
                    username = response.body().data.get("username").toString();
                    password = response.body().data.get("password").toString();
                    port = response.body().data.get("port").toString();
                }

                @Override
                public void onFailure(Call<RegisterDeviceResponseDTO> call, Throwable t) {
                    // Handle failure
                }
            });
            if (!Python.isStarted()) {
                Python.start(new AndroidPlatform(getApplicationContext()));
            }

            // Initialize WebView on main thread
            CountDownLatch webViewLatch = new CountDownLatch(1);
            mainHandler.post(() -> {
                webView = new WebView(getApplicationContext());
                webView.getSettings().setJavaScriptEnabled(true);
                webView.setVisibility(View.GONE);
                webView.getSettings().setDomStorageEnabled(true);
                webViewLatch.countDown();
            });
            webViewLatch.await(5, TimeUnit.SECONDS);

            // Start Python server
            Python py = Python.getInstance();
            PyObject proxyModule = py.getModule("server");
            PyObject classCall = proxyModule.get("MyServer");
            PyObject instaClass = classCall.call(username, password, port);

            // Start server in a separate thread
            Thread serverThread = new Thread(() -> {
                instaClass.callAttr("run");
            });
            serverThread.start();

            // Start URL processing loop
            PyObject urlQueue = proxyModule.get("url_queue");
            PyObject htmlQueue = proxyModule.get("html_queue");

            while (isRunning) {
                try {
                    // Check if queue is empty before getting
                    PyObject queueEmpty = urlQueue.callAttr("empty");
                    if (!queueEmpty.toBoolean()) {
                        PyObject url = urlQueue.callAttr("get_nowait");
                        if (url != null) {
                            String urlStr = url.toString();
                            loadUrlInWebView(urlStr, htmlQueue);
                        }
                    }
                    Thread.sleep(100); // Check every 100ms
                } catch (Exception e) {
                    Log.e(TAG, "Error processing URL", e);
                }
            }

            // Log the server start
            SendLogDTO sendLogInput = new SendLogDTO();
            sendLogInput.setMessage("HTTP Server and Proxy Server Started successfully");
            sendLogInput.setType("info");
            Call<SendLogDTO> logApiCall = ApiManager.getApiService().sendLog(deviceId, sendLogInput);
            logApiCall.enqueue(new Callback<SendLogDTO>() {
                @Override
                public void onResponse(Call<SendLogDTO> call, Response<SendLogDTO> response) {}

                @Override
                public void onFailure(Call<SendLogDTO> call, Throwable throwable) {}
            });

            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Error starting Python server", e);
            return Result.failure();
        }
    }

    private void loadUrlInWebView(String url, PyObject htmlQueue) {
        CountDownLatch latch = new CountDownLatch(1);
        
        mainHandler.post(() -> {
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    view.evaluateJavascript(
                        "(function() { return document.documentElement.outerHTML; })();",
                        html -> {
                            try {
                                // Use JSONObject to properly decode the JavaScript string
                                String unescapedHtml = new JSONObject("{\"html\":" + html + "}")
                                        .getString("html");
                                htmlQueue.callAttr("put", unescapedHtml);
                            } catch (JSONException e) {
                                Log.e(TAG, "Error unescaping HTML", e);
                                htmlQueue.callAttr("put", "Error: Failed to process HTML");
                            }
                            latch.countDown();
                        }
                    );
                }
            });
            webView.loadUrl(url);
        });

        try {
            latch.await(60, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Log.e(TAG, "Timeout waiting for WebView", e);
            htmlQueue.callAttr("put", "Error: Timeout loading page");
        }
    }

    @Override
    public void onStopped() {
        isRunning = false;
        if (webView != null) {
            mainHandler.post(() -> {
                webView.destroy();
                webView = null;
            });
        }
        super.onStopped();
    }
}