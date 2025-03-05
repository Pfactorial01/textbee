// MMSHelper.java
package com.vernu.smsmodified.helpers;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import android.util.Log;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;

public class MMSHelper {

    private static final String TAG = "MMSHelper";
    private static final String MMS_SENT_ACTION = "MMS_SENT_ACTION";
    private static final String MMS_DELIVERY_ACTION = "MMS_DELIVERY_ACTION"; // Optional
    private static final int RECEIVER_TIMEOUT_MS = 30000; // Timeout in milliseconds

    // Required permissions for sending MMS
    public static final String[] requiredPermissions = new String[]{
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_PHONE_STATE
    };

    public static void sendMMS(Context context, String recipient, String message, String mediaUrl) {
        sendMMSInternal(context, recipient, message, mediaUrl, -1, context); // -1 for default SIM, pass context
    }

    public static void sendMMSFromSpecificSim(Context context, String recipient, String message, String mediaUrl, int simSlot) {
        sendMMSInternal(context, recipient, message, mediaUrl, simSlot, context); // pass context
    }

    private static void sendMMSInternal(Context context, String recipient, String message, String mediaUrl, int simSlot, Context appContext) {
        // Use the application context to avoid leaking the service context
        Context appCtx = appContext.getApplicationContext();
        Uri localMediaUri = null;
        try {
            localMediaUri = downloadAndCacheMedia(appCtx, mediaUrl);
            if (localMediaUri == null) {
                Log.e(TAG, "Failed to download and cache media from: " + mediaUrl);
                return;
            }

            SmsManager smsManager;
            smsManager = SmsManager.getSmsManagerForSubscriptionId(simSlot);

            String locationUrl = null;
            Bundle configOverrides = Bundle.EMPTY;

//            // --- Sent Intent ---
//            Intent sentIntent = new Intent(MMS_SENT_ACTION);
//            PendingIntent sentPI = PendingIntent.getBroadcast(appCtx, 0, sentIntent, PendingIntent.FLAG_IMMUTABLE);
//
//            // --- Sent Status BroadcastReceiver ---
//            BroadcastReceiver sentReceiver = new BroadcastReceiver() {
//                @Override
//                public void onReceive(Context context, Intent intent) {
//                    String messageStatus = "MMS Status: ";
//                    int resultCode = getResultCode();
//                    switch (resultCode) {
//                        case Activity.RESULT_OK:
//                            messageStatus += "Sent successfully";
//                            break;
//                        case SmsManager.MMS_ERROR_UNSPECIFIED:
//                            messageStatus += "Unspecified error";
//                            break;
//                        case SmsManager.MMS_ERROR_INVALID_APN:
//                            messageStatus += "Invalid APN settings";
//                            break;
//                        case SmsManager.MMS_ERROR_UNABLE_CONNECT_MMS:
//                            messageStatus += "Unable to connect to MMS server";
//                            break;
//                        case SmsManager.MMS_ERROR_RETRY:
//                            messageStatus += "Generic retry error";
//                            break;
//                        case SmsManager.MMS_ERROR_CONFIGURATION_ERROR:
//                            messageStatus += "Configuration error";
//                            break;
//                        case SmsManager.MMS_ERROR_NO_DATA_NETWORK:
//                            messageStatus += "No data network";
//                            break;
//                        case SmsManager.MMS_ERROR_INVALID_SUBSCRIPTION_ID:
//                            messageStatus += "Invalid subscription ID";
//                            break;
//                        case SmsManager.MMS_ERROR_INACTIVE_SUBSCRIPTION:
//                            messageStatus += "Inactive subscription";
//                            break;
//                        case SmsManager.MMS_ERROR_DATA_DISABLED:
//                            messageStatus += "Data disabled";
//                            break;
//                        default:
//                            messageStatus += "Unknown error code: " + resultCode;
//                            break;
//                    }
//
//                    // Try to extract any extra information from the broadcast result.
//                    Bundle resultExtras = getResultExtras(false);
//                    if (resultExtras != null && !resultExtras.isEmpty()) {
//                        messageStatus += " | Extras: " + resultExtras.toString();
//                    } else {
//                        // Alternatively, check intent extras (if any)
//                        Bundle intentExtras = intent.getExtras();
//                        if (intentExtras != null && !intentExtras.isEmpty()) {
//                            messageStatus += " | Intent extras: " + intentExtras.toString();
//                        }
//                    }
//
//                    Log.d(TAG, messageStatus);
//                    Toast.makeText(context, messageStatus, Toast.LENGTH_SHORT).show();
//                    try {
//                        context.unregisterReceiver(this);
//                    } catch (IllegalArgumentException e) {
//                        Log.w(TAG, "Receiver already unregistered", e);
//                    }
//                }
//            };
//
//
//            // Register using the application context
//            appCtx.registerReceiver(sentReceiver, new IntentFilter(MMS_SENT_ACTION));
//
//            // Schedule a timeout to unregister the receiver if no broadcast is received
//            new Handler(Looper.getMainLooper()).postDelayed(() -> {
//                try {
//                    appCtx.unregisterReceiver(sentReceiver);
//                    Log.d(TAG, "Receiver unregistered due to timeout");
//                } catch (IllegalArgumentException e) {
//                    // Receiver was already unregistered
//                }
//            }, RECEIVER_TIMEOUT_MS);
//            if (android.os.Build.VERSION.SDK_INT >= 31) {
//                if (ContextCompat.checkSelfPermission(appCtx, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
//                    Log.d("MMS_PERMISSION_CHECK", "READ_PHONE_STATE: Permission Granted (Before sendMultimediaMessage)"); // Log here
//                    int messageId = 0;
//                    smsManager.sendMultimediaMessage(
//                            appCtx,
//                            localMediaUri,
//                            locationUrl,
//                            configOverrides,
//                            sentPI
//                    );
//                } else {
//                    Log.e("MMS_PERMISSION_CHECK", "READ_PHONE_STATE: Permission Denied (Before sendMultimediaMessage) - This should NOT happen if granted in MainActivity!"); // Log if denied
//                    // Handle case where permission is denied again (though unexpected)
//                }
//            } else {
//                Log.d(TAG, "Got here 2");
//                smsManager.sendMultimediaMessage(
//                        appCtx,
//                        localMediaUri,
//                        locationUrl,
//                        configOverrides,
//                        sentPI
//                );
//            }
            Log.d(TAG, "MMS sending initiated to: " + recipient + " with media from local URI: " + localMediaUri +
                    (simSlot != -1 ? " from sim slot: " + simSlot : ""));
        } catch (Exception ex) {
            Log.e(TAG, "Error sending MMS to: " + recipient, ex);
        }
    }

    private static Uri downloadAndCacheMedia(Context context, String mediaUrl) {
        if (mediaUrl == null || mediaUrl.isEmpty()) {
            Log.e(TAG, "Media URL is empty or null");
            return null;
        }

        File cacheDir = context.getCacheDir();
        String fileName = "mms_media_" + UUID.randomUUID().toString(); // Unique file name
        File cachedFile = new File(cacheDir, fileName);

        try {
            URL url = new URL(mediaUrl);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setDoInput(true);
            connection.connect();
            int responseCode = connection.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                Log.e(TAG, "HTTP error fetching media: " + responseCode + " for URL: " + mediaUrl);
                return null;
            }

            InputStream input = connection.getInputStream();
            FileOutputStream output = new FileOutputStream(cachedFile);

            byte[] buffer = new byte[4 * 1024]; // 4KB buffer
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                output.write(buffer, 0, bytesRead);
            }
            output.flush();
            output.close();
            input.close();

            Log.d(TAG, "Media downloaded and cached to: " + cachedFile.getAbsolutePath());
            // Return a content:// URI using FileProvider
            Uri contentUri = FileProvider.getUriForFile(context, "com.vernu.smsmodified.fileprovider", cachedFile);
            return contentUri;

        } catch (IOException e) {
            Log.e(TAG, "Error downloading and caching media from URL: " + mediaUrl, e);
            if (cachedFile.exists()) {
                cachedFile.delete();
            }
            return null;
        }
    }
}
