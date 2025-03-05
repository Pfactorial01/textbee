package com.vernu.smsmodified.receivers;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.SmsManager;
import android.util.Log;

public class MMSBroadcastReceiver extends BroadcastReceiver {
    private static final String TAG = "MMSBroadcastReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        int resultCode = getResultCode();
        String action = intent.getAction();
        
        if ("com.vernu.smsmodified.MMS_SENT".equals(action)) {
            switch (resultCode) {
                case Activity.RESULT_OK:
                    Log.d(TAG, "MMS sent successfully");
                    break;
                case SmsManager.RESULT_ERROR_GENERIC_FAILURE:
                    Log.e(TAG, "Generic failure cause");
                    break;
                case SmsManager.RESULT_ERROR_NO_SERVICE:
                    Log.e(TAG, "Service is currently unavailable");
                    break;
                case SmsManager.RESULT_ERROR_NULL_PDU:
                    Log.e(TAG, "No PDU provided");
                    break;
                case SmsManager.RESULT_ERROR_RADIO_OFF:
                    Log.e(TAG, "Radio was explicitly turned off");
                    break;
                default:
                    Log.e(TAG, "Unknown error code: " + resultCode);
                    break;
            }
        }
    }
} 