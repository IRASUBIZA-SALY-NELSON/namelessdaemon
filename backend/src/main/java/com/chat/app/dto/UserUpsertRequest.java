package com.chat.app.dto;

import lombok.Data;

/**
 * Safe request body for admin create/update — avoids null being mapped to primitive booleans.
 */
@Data
public class UserUpsertRequest {
    private String username;
    private String email;
    private String password;
    private String profilePicture;
    private String role;
    private Boolean enabled;
    private Boolean accountNonExpired;
    private Boolean accountNonLocked;
    private Boolean credentialsNonExpired;
    private Boolean chatEnabled;
    private Boolean chatPasscodeMustChange;
}
