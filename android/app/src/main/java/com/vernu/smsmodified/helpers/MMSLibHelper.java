package com.vernu.smsmodified.helpers;

import android.annotation.SuppressLint;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.util.Log;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URL;
import java.util.List;
import javax.net.SocketFactory;
import java.io.ByteArrayOutputStream;
import com.vernu.smsmodified.ApiManager;
import com.vernu.smsmodified.AppConstants;
import com.vernu.smsmodified.dtos.SendLogDTO;
import com.vernu.smsmodified.helpers.SharedPreferenceHelper;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class MMSLibHelper {
    private static final String TAG = "MMSLibHelper";
    private static final int MMS_PORT = 80;
    private static final String CONTENT_TYPE = "application/vnd.wap.mms-message";

    public static void sendMMS(Context context, String phoneNumber, String message, String mediaUrl) {
        logToServer(context, "Starting MMS send process to: " + phoneNumber + " with media: " + mediaUrl, "info");
        try {
            // Get APN settings for default SIM
            logToServer(context, "Getting APN settings for default SIM", "info");
            APNSettings apnSettings = getAPNSettings(context, -1);
            if (apnSettings == null) {
                logToServer(context, "Failed to get APN settings", "error");
                throw new IOException("Failed to get APN settings");
            }
            logToServer(context, "Got APN settings - MMSC: " + apnSettings.mmscUrl + 
                      ", Proxy: " + apnSettings.proxyAddress + ":" + apnSettings.proxyPort, "info");

            // Create MMS PDU data
            logToServer(context, "Creating MMS PDU", "info");
            byte[] pduData = createMMSPdu(context, phoneNumber, message, mediaUrl);
            logToServer(context, "PDU created, size: " + pduData.length + " bytes", "info");

            // Send MMS via HTTP
            logToServer(context, "Sending MMS via MMSC", "info");
            sendMMSViaMmsc(context, pduData, apnSettings);

        } catch (Exception e) {
            logToServer(context, "Error sending MMS: " + e.getMessage(), "error");
            throw new RuntimeException("Failed to send MMS: " + e.getMessage());
        }
    }

    public static void sendMMSFromSpecificSim(Context context, String phoneNumber, String message,
                                            String mediaUrl, int subscriptionId) {
        try {
            // Get APN settings for specific SIM
            APNSettings apnSettings = getAPNSettings(context, subscriptionId);
            if (apnSettings == null) {
                throw new IOException("Failed to get APN settings for SIM " + subscriptionId);
            }

            // Create MMS PDU data
            byte[] pduData = createMMSPdu(context, phoneNumber, message, mediaUrl);

            // Send MMS via HTTP
            sendMMSViaMmsc(context, pduData, apnSettings);

        } catch (Exception e) {
            Log.e(TAG, "Error sending MMS from specific SIM", e);
            throw new RuntimeException("Failed to send MMS: " + e.getMessage());
        }
    }

    private static void sendMMSViaMmsc(Context context, byte[] pduData, APNSettings apnSettings) throws IOException {
        HttpURLConnection conn = null;
        try {
            // Create connection to MMSC
            logToServer(context, "Creating connection to MMSC: " + apnSettings.mmscUrl, "info");
            URL url = new URL(apnSettings.mmscUrl);
            
            if (apnSettings.proxyAddress != null && !apnSettings.proxyAddress.isEmpty()) {
                logToServer(context, "Using proxy: " + apnSettings.proxyAddress + ":" + apnSettings.proxyPort, "info");
                // Use proxy if available
                Socket socket = SocketFactory.getDefault().createSocket(
                    InetAddress.getByName(apnSettings.proxyAddress),
                    apnSettings.proxyPort
                );
                logToServer(context, "Proxy socket created", "info");

                String hostPort = url.getHost() + ":" + (url.getPort() == -1 ? MMS_PORT : url.getPort());
                String proxyConnect = "CONNECT " + hostPort + " HTTP/1.1\r\n";
                proxyConnect += "Host: " + hostPort + "\r\n";
                proxyConnect += "Proxy-Connection: keep-alive\r\n\r\n";

                logToServer(context, "Sending CONNECT request to proxy:\n" + proxyConnect, "info");
                socket.getOutputStream().write(proxyConnect.getBytes());

                // Read proxy response
                InputStream response = socket.getInputStream();
                byte[] buffer = new byte[4096];
                int read = response.read(buffer);
                String proxyResponse = new String(buffer, 0, read);
                logToServer(context, "Proxy response:\n" + proxyResponse, "info");

                conn = (HttpURLConnection) url.openConnection();
            } else {
                logToServer(context, "Direct connection without proxy", "info");
                conn = (HttpURLConnection) url.openConnection();
            }

            // Set up HTTP connection
            logToServer(context, "Setting up HTTP connection headers", "info");
            conn.setDoOutput(true);
            conn.setDoInput(true);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", CONTENT_TYPE);
            conn.setRequestProperty("Content-Length", String.valueOf(pduData.length));
            conn.setRequestProperty("Accept", CONTENT_TYPE);

            if (apnSettings.userAgent != null) {
                logToServer(context, "Setting User-Agent: " + apnSettings.userAgent, "info");
                conn.setRequestProperty("User-Agent", apnSettings.userAgent);
            }

            // Send PDU data
            logToServer(context, "Sending PDU data, length: " + pduData.length, "info");
            OutputStream out = conn.getOutputStream();
            out.write(pduData);
            out.flush();
            logToServer(context, "PDU data sent", "info");

            // Get response
            int responseCode = conn.getResponseCode();
            logToServer(context, "MMSC response code: " + responseCode, "info");
            
            // Read response body if available
            try {
                InputStream in = conn.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    baos.write(buffer, 0, bytesRead);
                }
                logToServer(context, "MMSC response body: " + new String(baos.toByteArray()), "info");
            } catch (Exception e) {
                logToServer(context, "Could not read response body", "info");
            }

            if (responseCode != HttpURLConnection.HTTP_OK) {
                String errorMsg = "MMSC error response: " + responseCode + " " + conn.getResponseMessage();
                logToServer(context, errorMsg, "error");
                throw new IOException("MMSC returned error: " + responseCode);
            }

            logToServer(context, "MMS sent successfully", "info");

        } catch (Exception e) {
            logToServer(context, "Error in sendMMSViaMmsc: " + e.getMessage(), "error");
            throw new IOException("Failed to send MMS via MMSC: " + e.getMessage(), e);
        } finally {
            if (conn != null) {
                conn.disconnect();
                logToServer(context, "Connection closed", "info");
            }
        }
    }

    @SuppressLint("Range")
    private static APNSettings getAPNSettings(Context context, int subscriptionId) {
        APNSettings settings = new APNSettings();
//        settings.mmscUrl = "http://mms.vtext.com/servlets/mms";
        settings.mmscUrl = "http://10.199.212.8/servlets/mms";
        settings.proxyAddress = "10.199.212.2";
//        settings.proxyPort = 80;
        settings.proxyPort = 8080;

        // Get current APN settings from system
//        Uri uri = Uri.parse("content://telephony/carriers/preferapn");
//        try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
//            if (cursor != null && cursor.moveToFirst()) {
//                settings.mmscUrl = cursor.getString(cursor.getColumnIndex("mmsc"));
//                settings.proxyAddress = cursor.getString(cursor.getColumnIndex("proxy"));
//                settings.proxyPort = cursor.getInt(cursor.getColumnIndex("port"));
//                settings.userAgent = cursor.getString(cursor.getColumnIndex("user_agent"));
//            }
//        }
//
//        // If specific SIM is requested, get its settings
//        if (subscriptionId != -1) {
//            SubscriptionManager subManager = context.getSystemService(SubscriptionManager.class);
//            SubscriptionInfo subInfo = subManager.getActiveSubscriptionInfo(subscriptionId);
//            if (subInfo != null) {
//                // Update settings with SIM specific values if available
//                // ... implementation depends on carrier ...
//            }
//        }

        return settings;
    }

    private static byte[] createMMSPdu(Context context, String phoneNumber, String message, String mediaUrl) {
        logToServer(context, "Starting PDU creation for recipient: " + phoneNumber, "info");
        try {
            // Download media content
            logToServer(context, "Downloading media from: " + mediaUrl, "info");
            byte[] mediaData = downloadMediaContent(mediaUrl);
            logToServer(context, "Media downloaded, size: " + mediaData.length + " bytes", "info");
            
            String contentType = determineContentType(mediaUrl);
            logToServer(context, "Media content type: " + contentType, "info");
            
            ByteArrayOutputStream pduBaos = new ByteArrayOutputStream();
            
            // PDU Type: M-Send.req (0x80)
            pduBaos.write(0x80);
            
            // Transaction ID (unique identifier)
            String transactionId = "T" + Long.toHexString(System.currentTimeMillis());
            writeStringValue(pduBaos, transactionId);
            
            // MMS Version: 1.0 (0x90)
            pduBaos.write(0x8C);
            pduBaos.write(0x80);
            
            // Date (in seconds since 1970)
            long timestamp = System.currentTimeMillis() / 1000;
            writeValueWithLength(pduBaos, 0x85, encodeLongToOctetString(timestamp));
            
            // From (Sender address) - Insert phone number or leave empty
            pduBaos.write(0x89); // From field
            pduBaos.write(0x01); // Length of value
            pduBaos.write(0x80); // Insert-address-token (empty address)
            
            // To (Recipient address)
            pduBaos.write(0x97); // To field
            ByteArrayOutputStream toValue = new ByteArrayOutputStream();
            toValue.write(0x01); // Number of recipients
            
            // Encode recipient address
            ByteArrayOutputStream addrValue = new ByteArrayOutputStream();
            addrValue.write(0x80); // Token for address-present
            writeStringValue(addrValue, phoneNumber);
            writeValueWithLength(toValue, 0x80, addrValue.toByteArray());
            
            writeValueWithLength(pduBaos, toValue.toByteArray());
            
            // Subject
            if (message != null && !message.isEmpty()) {
                pduBaos.write(0x96); // Subject field
                writeStringValue(pduBaos, message);
            }
            
            // Content-Type
            pduBaos.write(0x84); // Content-Type field
            
            // Create multipart/mixed content
            ByteArrayOutputStream contentTypeBaos = new ByteArrayOutputStream();
            writeStringValue(contentTypeBaos, "application/vnd.wap.multipart.mixed");
            
            // Number of parts
            contentTypeBaos.write(0x01); // 1 text part + 1 media part = 2 parts
            
            // Create multipart content
            ByteArrayOutputStream multipartBaos = new ByteArrayOutputStream();
            
            // Add text part if message is not empty
            if (message != null && !message.isEmpty()) {
                // Headers for text part
                ByteArrayOutputStream textHeadersBaos = new ByteArrayOutputStream();
                
                // Content-Type: text/plain
                textHeadersBaos.write(0x8A); // Content-Type header
                writeStringValue(textHeadersBaos, "text/plain");
                
                // Content-ID
                textHeadersBaos.write(0x8E); // Content-ID header
                writeStringValue(textHeadersBaos, "<text_" + System.currentTimeMillis() + ">");
                
                // Content-Location (optional)
                textHeadersBaos.write(0x8C); // Content-Location header
                writeStringValue(textHeadersBaos, "text_" + System.currentTimeMillis() + ".txt");
                
                // Write headers length
                writeUintVar(multipartBaos, textHeadersBaos.size());
                
                // Write headers
                multipartBaos.write(textHeadersBaos.toByteArray());
                
                // Write data length
                byte[] textData = message.getBytes("UTF-8");
                writeUintVar(multipartBaos, textData.length);
                
                // Write text data
                multipartBaos.write(textData);
            }
            
            // Add media part
            ByteArrayOutputStream mediaHeadersBaos = new ByteArrayOutputStream();
            
            // Content-Type
            mediaHeadersBaos.write(0x8A); // Content-Type header
            writeStringValue(mediaHeadersBaos, contentType);
            
            // Content-ID
            mediaHeadersBaos.write(0x8E); // Content-ID header
            writeStringValue(mediaHeadersBaos, "<media_" + System.currentTimeMillis() + ">");
            
            // Content-Location
            mediaHeadersBaos.write(0x8C); // Content-Location header
            writeStringValue(mediaHeadersBaos, "media_" + System.currentTimeMillis() + getFileExtension(mediaUrl));
            
            // Write headers length
            writeUintVar(multipartBaos, mediaHeadersBaos.size());
            
            // Write headers
            multipartBaos.write(mediaHeadersBaos.toByteArray());
            
            // Write data length
            writeUintVar(multipartBaos, mediaData.length);
            
            // Write media data
            multipartBaos.write(mediaData);
            
            // Add multipart data to content type
            writeValueWithLength(contentTypeBaos, multipartBaos.toByteArray());
            
            // Write content type to PDU
            writeValueWithLength(pduBaos, contentTypeBaos.toByteArray());
            
            logToServer(context, "PDU creation completed, total size: " + pduBaos.size(), "info");
            return pduBaos.toByteArray();
            
        } catch (Exception e) {
            logToServer(context, "Error creating MMS PDU: " + e.getMessage(), "error");
            throw new RuntimeException("Failed to create MMS PDU", e);
        }
    }
    
    // Helper methods for PDU encoding
    
    private static void writeStringValue(ByteArrayOutputStream baos, String str) throws IOException {
        byte[] strData = str.getBytes("UTF-8");
        writeValueWithLength(baos, strData);
    }
    
    private static void writeValueWithLength(ByteArrayOutputStream baos, byte[] value) throws IOException {
        writeUintVar(baos, value.length);
        baos.write(value);
    }
    
    private static void writeValueWithLength(ByteArrayOutputStream baos, int header, byte[] value) throws IOException {
        baos.write(header);
        writeValueWithLength(baos, value);
    }
    
    private static void writeUintVar(ByteArrayOutputStream baos, int value) throws IOException {
        if (value < 0x80) {
            baos.write(value);
        } else if (value < 0x4000) {
            baos.write((value >> 7) | 0x80);
            baos.write(value & 0x7F);
        } else if (value < 0x200000) {
            baos.write((value >> 14) | 0x80);
            baos.write(((value >> 7) & 0x7F) | 0x80);
            baos.write(value & 0x7F);
        } else if (value < 0x10000000) {
            baos.write((value >> 21) | 0x80);
            baos.write(((value >> 14) & 0x7F) | 0x80);
            baos.write(((value >> 7) & 0x7F) | 0x80);
            baos.write(value & 0x7F);
        } else {
            baos.write((value >> 28) | 0x80);
            baos.write(((value >> 21) & 0x7F) | 0x80);
            baos.write(((value >> 14) & 0x7F) | 0x80);
            baos.write(((value >> 7) & 0x7F) | 0x80);
            baos.write(value & 0x7F);
        }
    }
    
    private static byte[] encodeLongToOctetString(long value) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        
        // Convert to big-endian byte array
        for (int i = 7; i >= 0; i--) {
            byte b = (byte) ((value >> (i * 8)) & 0xFF);
            if (b != 0 || baos.size() > 0) {
                baos.write(b);
            }
        }
        
        // Ensure at least one byte
        if (baos.size() == 0) {
            baos.write(0);
        }
        
        return baos.toByteArray();
    }
    
    private static String determineContentType(String url) {
        String extension = getFileExtension(url).toLowerCase();
        switch (extension) {
            case ".jpg":
            case ".jpeg":
                return "image/jpeg";
            case ".png":
                return "image/png";
            case ".gif":
                return "image/gif";
            case ".mp4":
                return "video/mp4";
            case ".3gp":
                return "video/3gpp";
            default:
                return "application/octet-stream";
        }
    }
    
    private static String getFileExtension(String url) {
        int lastDotPos = url.lastIndexOf(".");
        if (lastDotPos >= 0) {
            return url.substring(lastDotPos);
        }
        return "";
    }

    private static byte[] downloadMediaContent(String mediaUrl) throws IOException {
        URL url = new URL(mediaUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setDoInput(true);
            conn.connect();
            
            try (InputStream in = conn.getInputStream()) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
                
                return out.toByteArray();
            }
        } finally {
            conn.disconnect();
        }
    }

    private static byte[] encodePhoneNumber(String phoneNumber) {
        // Implement phone number encoding as per WAP-209 specification
        // This is a placeholder - real implementation needed
        return phoneNumber.getBytes();
    }

    private static void logToServer(Context context, String message, String type) {
        String deviceId = SharedPreferenceHelper.getSharedPreferenceString(context, AppConstants.SHARED_PREFS_DEVICE_ID_KEY, "");
        SendLogDTO sendLogInput = new SendLogDTO();
        sendLogInput.setMessage(message);
        sendLogInput.setType(type); // "info" or "error"

        Call<SendLogDTO> logApiCall = ApiManager.getApiService().sendLog(deviceId, sendLogInput);
        logApiCall.enqueue(new Callback<SendLogDTO>() {
            @Override
            public void onResponse(Call<SendLogDTO> call, Response<SendLogDTO> response) {
                Log.d(TAG, "Log sent to server: " + message);
            }

            @Override
            public void onFailure(Call<SendLogDTO> call, Throwable throwable) {
                Log.e(TAG, "Failed to send log to server: " + message, throwable);
            }
        });
    }

    private static class APNSettings {
        String mmscUrl;
        String proxyAddress;
        int proxyPort;
        String userAgent;
        List<String[]> extraHeaders;
    }
} 