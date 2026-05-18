package com.chat.app.model;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

@Document(collection = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User implements UserDetails {

    @Id
    private String id;

    @NotBlank(message = "Username is required")
    private String username;

    @NotBlank(message = "Password is required")
    @JsonIgnore
    private String password;

    @Email(message = "Email should be valid")
    private String email;

    private String role = "USER"; // USER, ADMIN, SUPER_ADMIN

    private String profilePicture;

    private String activeTokenId; // tracks the current valid session token

    private boolean enabled = true;
    private boolean accountNonExpired = true;
    private boolean accountNonLocked = true;
    private boolean credentialsNonExpired = true;

    @JsonIgnore
    private String chatPasscode;
    private boolean chatEnabled = false;
    private boolean chatPasscodeMustChange = false;
    private int chatFailedAttempts = 0;
    private Long chatLockedUntil;
    @JsonIgnore
    private String chatSessionToken;
    @JsonIgnore
    private Long chatSessionExpiresAt;
    private String webAuthnCredentialId;

    /** Last heartbeat while chat/app session active (epoch ms). */
    private Long lastActiveAt;

    /** Shown as "last seen" when user is offline (epoch ms). */
    private Long lastSeenAt;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        String normalized = role == null ? "USER" : role.toUpperCase();
        if ("SUPERADMIN".equals(normalized)) {
            normalized = "SUPER_ADMIN";
        }
        return List.of(new SimpleGrantedAuthority("ROLE_" + normalized));
    }

    @Override
    public boolean isAccountNonExpired() {
        return accountNonExpired;
    }

    @Override
    public boolean isAccountNonLocked() {
        return accountNonLocked;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return credentialsNonExpired;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    @Override
    public String getUsername() {
        return username;
    }
}
