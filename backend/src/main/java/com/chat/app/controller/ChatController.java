package com.chat.app.controller;

import com.chat.app.dto.ChatProfileDto;
import com.chat.app.dto.ChatReadReceiptDto;
import com.chat.app.dto.ChatUserSummary;
import com.chat.app.model.ChatMessage;
import com.chat.app.model.User;
import com.chat.app.repository.UserRepository;
import com.chat.app.service.ChatService;
import com.chat.app.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.bson.Document;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final UserService userService;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final MongoTemplate mongoTemplate;

    @GetMapping("/api/chat/debug/raw")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Document>> getRawMessages() {
        List<Document> docs = mongoTemplate.getDb()
            .getCollection("chat_messages")
            .find()
            .limit(5)
            .into(new java.util.ArrayList<>());
        return ResponseEntity.ok(docs);
    }

    @GetMapping("/api/chat/users")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ChatUserSummary>> getChatUsers(Authentication authentication) {
        String excludeId = userRepository.findByUsername(authentication.getName())
                .map(User::getId)
                .orElse(null);
        return ResponseEntity.ok(userService.getChatDirectoryUsers(excludeId));
    }

    @GetMapping("/api/chat/users/{userId}/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ChatProfileDto> getChatProfile(@PathVariable String userId) {
        return userService.getChatProfile(userId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/api/chat/unread")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Integer>> getUnreadCounts(Authentication authentication) {
        String userId = userRepository.findByUsername(authentication.getName())
                .map(User::getId)
                .orElse(null);
        if (userId == null) {
            return ResponseEntity.ok(Map.of());
        }
        return ResponseEntity.ok(chatService.getUnreadCountsBySender(userId));
    }

    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload ChatMessage chatMessage) {
        try {
            chatMessage.setStatus(ChatMessage.MessageStatus.DELIVERED);
            ChatMessage savedMessage = chatService.saveMessage(chatMessage);

            if (chatMessage.isChannel()) {
                messagingTemplate.convertAndSend("/topic/channel." + chatMessage.getRecipientId(), savedMessage);
            } else {
                pushToUser(chatMessage.getRecipientId(), savedMessage);
                pushToUser(chatMessage.getSenderId(), savedMessage);
            }
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(ChatController.class)
                    .warn("Failed to process chat message: {}", e.getMessage());
        }
    }

    private void pushToUser(String userId, Object payload) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        messagingTemplate.convertAndSend("/topic/chat.user." + userId, payload);
    }

    private void pushReadReceipt(ChatMessage msg, String readerId) {
        ChatReadReceiptDto receipt = ChatReadReceiptDto.builder()
                .messageId(msg.getId())
                .readerId(readerId)
                .senderId(msg.getSenderId())
                .status(ChatMessage.MessageStatus.READ.name())
                .build();
        pushToUser(msg.getSenderId(), receipt);
    }

    @GetMapping("/api/chat/messages/direct/{userId1}/{userId2}")
    public ResponseEntity<List<ChatMessage>> getDirectMessages(@PathVariable String userId1, @PathVariable String userId2) {
        return ResponseEntity.ok(chatService.getDirectMessages(userId1, userId2));
    }

    @GetMapping("/api/chat/messages/channel/{channelId}")
    public ResponseEntity<List<ChatMessage>> getChannelMessages(@PathVariable String channelId) {
        return ResponseEntity.ok(chatService.getChannelMessages(channelId));
    }

    @PostMapping("/api/chat/messages/{messageId}/read")
    public ResponseEntity<?> markAsRead(@PathVariable String messageId, Authentication authentication) {
        String readerId = userRepository.findByUsername(authentication.getName())
                .map(User::getId)
                .orElse(null);
        chatService.markAsRead(messageId).ifPresent(msg -> {
            if (readerId != null && !readerId.equals(msg.getSenderId())) {
                pushReadReceipt(msg, readerId);
            }
        });
        return ResponseEntity.ok().build();
    }

    @PostMapping("/api/chat/messages/{messageId}/unread")
    public ResponseEntity<?> markAsUnread(@PathVariable String messageId) {
        chatService.markAsUnread(messageId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/api/chat/messages/read-all/{recipientId}/{senderId}")
    public ResponseEntity<?> markAllAsRead(
            @PathVariable String recipientId,
            @PathVariable String senderId,
            Authentication authentication) {
        chatService.markAllAsRead(recipientId, senderId);
        String readerId = userRepository.findByUsername(authentication.getName())
                .map(User::getId)
                .orElse(recipientId);
        ChatReadReceiptDto bulk = ChatReadReceiptDto.builder()
                .readerId(readerId)
                .senderId(senderId)
                .status(ChatMessage.MessageStatus.READ.name())
                .build();
        pushToUser(senderId, bulk);
        return ResponseEntity.ok().build();
    }
}
