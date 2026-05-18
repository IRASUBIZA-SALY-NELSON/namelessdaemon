package com.chat.app.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserMeResponse {
    private String id;
    private String username;
    private String email;
    private String role;
    private String profilePicture;
    private boolean chatEnabled;
    private boolean chatPasscodeMustChange;
    private boolean chatPasscodeLocked;
    private Long chatLockedUntil;
    private int chatFailedAttempts;
    private boolean webAuthnRegistered;
    private boolean chatSessionActive;
}
