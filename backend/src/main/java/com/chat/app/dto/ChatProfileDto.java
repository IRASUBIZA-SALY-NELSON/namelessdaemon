package com.chat.app.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatProfileDto {
    private String id;
    private String username;
    private String email;
    private String role;
    private String profilePicture;
    private boolean chatEnabled;
    private boolean online;
    private Long lastSeenAt;
}
