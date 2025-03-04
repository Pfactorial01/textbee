// FCMService.java
package com.vernu.smsmodified.services;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.google.gson.Gson;
import com.vernu.smsmodified.ApiManager;
import com.vernu.smsmodified.AppConstants;
import com.vernu.smsmodified.R;
import com.vernu.smsmodified.activities.MainActivity;
import com.vernu.smsmodified.dtos.SendLogDTO;
import com.vernu.smsmodified.helpers.SMSHelper;
import com.vernu.smsmodified.helpers.SharedPreferenceHelper;
import com.vernu.smsmodified.helpers.MMSLibHelper;
import com.vernu.smsmodified.models.SMSPayload;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class FCMService extends FirebaseMessagingService {

    private static final String TAG = "FirebaseMessagingService";
    private static final String DEFAULT_NOTIFICATION_CHANNEL_ID = "N1";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        String deviceId = SharedPreferenceHelper.getSharedPreferenceString(this, AppConstants.SHARED_PREFS_DEVICE_ID_KEY, "");
        SendLogDTO sendLogInput = new SendLogDTO();
        sendLogInput.setMessage("Message received from firebase");
        sendLogInput.setType("info");

        // Log receipt of message
        Call<SendLogDTO> logApiCall = ApiManager.getApiService().sendLog(deviceId, sendLogInput);
        logApiCall.enqueue(new Callback<SendLogDTO>() {
            @Override
            public void onResponse(Call<SendLogDTO> call, Response<SendLogDTO> response) {
                Log.d("Response1", response.toString());
            }

            @Override
            public void onFailure(Call<SendLogDTO> call, Throwable throwable) {
                Log.e(TAG, "Failed to log message receipt", throwable);
            }
        });

        // Parse the payload
        Gson gson = new Gson();
        SMSPayload smsPayload = gson.fromJson(remoteMessage.getData().get("smsData"), SMSPayload.class);

        // Check if message contains a data payload
        if (remoteMessage.getData().size() > 0) {
            int preferredSim = SharedPreferenceHelper.getSharedPreferenceInt(this, AppConstants.SHARED_PREFS_PREFERRED_SIM_KEY, -1);

            for (String recipient : smsPayload.getRecipients()) {
                try {
                    // Determine message type and send accordingly
                    if ("mms".equalsIgnoreCase(smsPayload.getSmsType()) && smsPayload.getMediaUrl() != null) {
                        sendMMSMessage(recipient, smsPayload.getMessage(), smsPayload.getMediaUrl(), preferredSim);
                    } else {
                        sendSMSMessage(recipient, smsPayload.getMessage(), preferredSim);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error sending message", e);
                    logError(deviceId, e.getMessage());
                }
            }
        }

        // Handle notifications if needed
//        if (remoteMessage.getNotification() != null) {
//            sendNotification(remoteMessage.getNotification().getTitle(),
//                    remoteMessage.getNotification().getBody());
//        }
    }

    private void sendSMSMessage(String recipient, String message, int preferredSim) {
        if (preferredSim == -1) {
            SMSHelper.sendSMS(recipient, message);
        } else {
            SMSHelper.sendSMSFromSpecificSim(recipient, message, preferredSim);
        }
    }

    private void sendMMSMessage(String recipient, String message, String mediaUrl, int preferredSim) {
        try {
            if (preferredSim == -1) {
                MMSLibHelper.sendMMS(this, recipient, message, mediaUrl);
            } else {
                MMSLibHelper.sendMMSFromSpecificSim(this, recipient, message, mediaUrl, preferredSim);
            }
            Log.d(TAG, "MMS sent successfully to: " + recipient);
        } catch (Exception e) {
            Log.e(TAG, "Failed to send MMS to: " + recipient, e);
            throw e; // Re-throw to be caught by the outer try-catch for error logging
        }
    }

    private void logError(String deviceId, String errorMessage) {
        SendLogDTO sendLogInput = new SendLogDTO();
        sendLogInput.setMessage(errorMessage);
        sendLogInput.setType("error");
        Call<SendLogDTO> logApiCall = ApiManager.getApiService().sendLog(deviceId, sendLogInput);
        logApiCall.enqueue(new Callback<SendLogDTO>() {
            @Override
            public void onResponse(Call<SendLogDTO> call, Response<SendLogDTO> response) {
                Log.d(TAG, "Error logged successfully");
            }

            @Override
            public void onFailure(Call<SendLogDTO> call, Throwable throwable) {
                Log.e(TAG, "Failed to log error", throwable);
            }
        });
    }

    @Override
    public void onNewToken(String token) {
        sendRegistrationToServer(token);
    }

    private void sendRegistrationToServer(String token) {

    }

    /* build and show notification */
    private void sendNotification(String title, String messageBody) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0 /* Request code */, intent,
                PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE);

        String channelId = DEFAULT_NOTIFICATION_CHANNEL_ID;
        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        NotificationCompat.Builder notificationBuilder =
                new NotificationCompat.Builder(this, DEFAULT_NOTIFICATION_CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_launcher_foreground)
                        .setContentTitle(title)
                        .setContentText(messageBody)
                        .setAutoCancel(true)
                        .setSound(defaultSoundUri)
                        .setContentIntent(pendingIntent);

        NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // Since android Oreo notification channel is needed.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(channelId,
                    "Channel human readable title",
                    NotificationManager.IMPORTANCE_DEFAULT);
            notificationManager.createNotificationChannel(channel);
        }

        notificationManager.notify(0 /* ID of notification */, notificationBuilder.build());
    }
}