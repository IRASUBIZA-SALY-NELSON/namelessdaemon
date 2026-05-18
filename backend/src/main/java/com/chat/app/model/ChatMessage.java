package com.chat.app.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

@Document(collection = "chat_messages")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessage {

    @Id
    private String id;
    private String senderId;
    private String senderUsername;
    private String senderProfilePicture;
    private String recipientId; // Can be a userId or "GENERAL"
    private String content; // Double Base64 encoded
    private String fileUrl; // For images, files, or audio (Base64 data URL)
    private String fileName;
    private Long fileSize;
    private LocalDateTime timestamp;
    private MessageType type; // CHAT, JOIN, LEAVE, IMAGE, FILE, AUDIO
    private MessageStatus status; // SENT, DELIVERED, READ
    @Field("isChannel")
    @com.fasterxml.jackson.annotation.JsonProperty("isChannel")
    private boolean channel; // stored as "isChannel" in MongoDB, exposed as "isChannel" in JSON

    public boolean isChannel() { return channel; }
    public void setChannel(boolean channel) { this.channel = channel; }

    public enum MessageType {
        CHAT, JOIN, LEAVE, IMAGE, FILE, AUDIO
    }

    public enum MessageStatus {
        SENT, DELIVERED, READ
    }
}
