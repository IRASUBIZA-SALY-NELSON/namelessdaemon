package com.chat.app.service;

import com.chat.app.model.ChatMessage;
import com.chat.app.repository.ChatMessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatService {

    private static final int MESSAGE_PAGE_SIZE = 150;

    private final ChatMessageRepository chatMessageRepository;

    public ChatMessage saveMessage(ChatMessage message) {
        if (message.getTimestamp() == null) {
            message.setTimestamp(LocalDateTime.now());
        }
        if (message.getStatus() == null) {
            message.setStatus(ChatMessage.MessageStatus.SENT);
        }
        return chatMessageRepository.save(message);
    }

    public List<ChatMessage> getDirectMessages(String user1, String user2) {
        PageRequest page = PageRequest.of(0, MESSAGE_PAGE_SIZE, Sort.by(Sort.Direction.DESC, "timestamp"));
        List<ChatMessage> messages = chatMessageRepository.findDirectMessages(user1, user2, page);
        messages.sort(Comparator.comparing(ChatMessage::getTimestamp, Comparator.nullsLast(Comparator.naturalOrder())));
        return messages;
    }

    public List<ChatMessage> getChannelMessages(String channelId) {
        PageRequest page = PageRequest.of(0, MESSAGE_PAGE_SIZE, Sort.by(Sort.Direction.DESC, "timestamp"));
        List<ChatMessage> messages = chatMessageRepository.findByRecipientIdAndIsChannelTrueOrderByTimestampDesc(channelId, page);
        if (messages == null) {
            return Collections.emptyList();
        }
        messages.sort(Comparator.comparing(ChatMessage::getTimestamp, Comparator.nullsLast(Comparator.naturalOrder())));
        return messages;
    }

    public Optional<ChatMessage> markAsRead(String messageId) {
        return chatMessageRepository.findById(messageId).map(msg -> {
            msg.setStatus(ChatMessage.MessageStatus.READ);
            return chatMessageRepository.save(msg);
        });
    }

    public void markAsUnread(String messageId) {
        chatMessageRepository.findById(messageId).ifPresent(msg -> {
            msg.setStatus(ChatMessage.MessageStatus.SENT);
            chatMessageRepository.save(msg);
        });
    }

    public void markAllAsRead(String recipientId, String senderId) {
        chatMessageRepository.markConversationAsRead(recipientId, senderId);
    }

    public Map<String, Integer> getUnreadCountsBySender(String recipientId) {
        List<ChatMessage> unread = chatMessageRepository.findByRecipientIdAndStatusNotAndIsChannelFalse(
                recipientId, ChatMessage.MessageStatus.READ);
        return unread.stream()
                .collect(Collectors.groupingBy(
                        ChatMessage::getSenderId,
                        Collectors.collectingAndThen(Collectors.counting(), Long::intValue)));
    }
}
