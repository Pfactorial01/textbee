package com.vernu.smsmodified.models;

public class SMSPayload {

    private String[] recipients;
    private String message;
    private String mediaUrl;
    private String smsType;

    // Legacy fields that are no longer used
    private String[] receivers;
    private String smsBody;

    public SMSPayload() {
    }

    public String[] getRecipients() {
        return recipients;
    }

    public void setRecipients(String[] recipients) {
        this.recipients = recipients;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getMediaUrl() {
        return mediaUrl;
    }

    public void setMediaUrl(String mediaUrl) {
        this.mediaUrl = mediaUrl;
    }

    public String getSmsType() {
        return smsType;
    }

    public void setSmsType(String smsType) {
        this.smsType = smsType;
    }
}
