package com.chat.app.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Lightweight user row for chat sidebar (no secrets / heavy fields). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatUserSummary {
    private String id;
    private String username;
    private String role;
    private String profilePicture;
    private boolean chatEnabled;
    private boolean online;
    private Long lastSeenAt;
}
