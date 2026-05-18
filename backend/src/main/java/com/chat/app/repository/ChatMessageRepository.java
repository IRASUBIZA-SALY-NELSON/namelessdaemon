package com.chat.app.repository;

import com.chat.app.model.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.mongodb.repository.Update;

import java.util.List;

public interface ChatMessageRepository extends MongoRepository<ChatMessage, String> {

    // Find messages between two users (DM), newest first (limited by Pageable)
    @Query(value = "{$or: [{senderId: ?0, recipientId: ?1, isChannel: false}, {senderId: ?1, recipientId: ?0, isChannel: false}]}")
    List<ChatMessage> findDirectMessages(String user1, String user2, Pageable pageable);

    // Find channel messages, newest first (limited by Pageable)
    @Query(value = "{recipientId: ?0, isChannel: true}", sort = "{timestamp: -1}")
    List<ChatMessage> findByRecipientIdAndIsChannelTrueOrderByTimestampDesc(String channelId, Pageable pageable);

    @Query("{ 'recipientId': ?0, 'senderId': ?1, 'isChannel': false, 'status': { $ne: 'READ' } }")
    @Update("{ $set: { 'status': 'READ' } }")
    void markConversationAsRead(String recipientId, String senderId);

    // Find all unread DMs for a user
    @Query("{ 'recipientId': ?0, 'isChannel': false, 'status': { $ne: ?1 } }")
    List<ChatMessage> findByRecipientIdAndStatusNotAndIsChannelFalse(String recipientId, ChatMessage.MessageStatus status);
}
