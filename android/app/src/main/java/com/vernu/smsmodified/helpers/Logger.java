package com.vernu.smsmodified.helpers;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.text.SimpleDateFormat;
import java.util.Date;

public class Logger {

    private static final String TAG = "Logger";
    private static final String LOG_FILE_NAME = "textbee_log.txt";

    public static void log(Context context, String message) {
        Log.d(TAG, message);
        writeToFile(context, message);
    }

    private static void writeToFile(Context context, String message) {
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, LOG_FILE_NAME);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain"); // Important: Set the MIME type
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // API 29+
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS); // Or another appropriate directory
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            }

            Uri collection = null;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            }
            Uri item = context.getContentResolver().insert(collection, values);

            if (item != null) {
                try (OutputStream outputStream = context.getContentResolver().openOutputStream(item);
                     BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(outputStream))) {

                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
                    String timestamp = sdf.format(new Date());
                    String logMessage = timestamp + ": " + message + "\n";
                    writer.write(logMessage);
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear();
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    context.getContentResolver().update(item, values, null, null);
                }
            } else {
                Log.e(TAG, "Failed to create MediaStore entry.");
            }

        } catch (IOException e) {
            Log.e(TAG, "Error writing to log file", e);
        }
    }
}