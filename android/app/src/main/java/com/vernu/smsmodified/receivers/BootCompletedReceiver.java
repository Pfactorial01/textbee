package com.vernu.smsmodified.receivers;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootCompletedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
//            if(TextBeeUtils.isPermissionGranted(context, Manifest.permission.RECEIVE_SMS)){
//                TextBeeUtils.startStickyNotificationService(context);
//            }
        }
    }
}
