package com.chat.app.service;

import com.chat.app.dto.ChatProfileDto;
import com.chat.app.dto.ChatUserSummary;
import com.chat.app.dto.UserUpsertRequest;
import com.chat.app.model.User;
import com.chat.app.model.PasswordResetToken;
import com.chat.app.repository.PasswordResetTokenRepository;
import com.chat.app.repository.UserRepository;
import com.chat.app.security.Roles;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final PasswordResetTokenRepository tokenRepository;
    private final ChatPresenceService chatPresenceService;

    @Value("${app.frontend.url:http://localhost:3000}")
    private String frontendUrl;

    public void requestPasswordReset(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("No account found with this email: " + email));

        // Delete any existing tokens for this user
        tokenRepository.deleteByUserId(user.getId());

        // Generate new token
        String token = UUID.randomUUID().toString();
        PasswordResetToken resetToken = new PasswordResetToken(token, user.getId(), 30); // 30 minutes expiry
        tokenRepository.save(resetToken);

        // Send email
        sendResetPasswordEmail(user, token);
    }

    public void resetPassword(String token, String newPassword) {
        PasswordResetToken resetToken = tokenRepository.findByToken(token)
                .orElseThrow(() -> new RuntimeException("Invalid or expired reset token"));

        if (resetToken.isExpired()) {
            tokenRepository.delete(resetToken);
            throw new RuntimeException("Reset token has expired");
        }

        User user = userRepository.findById(resetToken.getUserId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        // Clean up
        tokenRepository.delete(resetToken);
    }

    private void sendResetPasswordEmail(User user, String token) {
        String base = frontendUrl.replaceAll("/$", "");
        String resetUrl = base + "/reset-password?token=" + token;
        String subject = "Password Reset Request - TaskFlow";
        String body = getPasswordResetBody(user, resetUrl);

        emailService.sendEmail(user.getEmail(), subject, body);
    }

    private String getPasswordResetBody(User user, String resetUrl) {
        return """
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Reset Your Password</title>
                </head>
                <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 20px;">
                    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
                        <div style="background: #2563eb; padding: 30px; text-align: center; color: white;">
                            <h1 style="margin: 0;">Password Reset</h1>
                        </div>
                        <div style="padding: 40px 30px;">
                            <p>Hello <strong>%s</strong>,</p>
                            <p>We received a request to reset your TaskFlow account password. Click the button below to choose a new password:</p>
                            <div style="text-align: center; margin: 40px 0;">
                                <a href="%s" style="background: #2563eb; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
                            </div>
                            <p style="color: #64748b; font-size: 14px;">This link will expire in 30 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
                        </div>
                        <div style="background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0;">
                            TaskFlow © 2026 | Built by Irasubiza Saly Nelson
                        </div>
                    </div>
                </body>
                </html>
                """.formatted(user.getUsername(), resetUrl);
    }

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    /**
     * Chat sidebar: USER (chat enabled) and SUPER_ADMIN only — never ADMIN.
     */
    public List<ChatUserSummary> getChatDirectoryUsers(String excludeUserId) {
        return userRepository.findByRoleIn(List.of(Roles.USER, Roles.SUPER_ADMIN)).stream()
                .filter(u -> {
                    String role = Roles.normalize(u.getRole());
                    if (Roles.isAdmin(role)) {
                        return false;
                    }
                    if (Roles.isSuperAdmin(role)) {
                        return true;
                    }
                    if (Roles.isUser(role)) {
                        return u.isChatEnabled();
                    }
                    return false;
                })
                .filter(u -> excludeUserId == null || !excludeUserId.equals(u.getId()))
                .map(this::toChatUserSummary)
                .collect(Collectors.toList());
    }

    public Optional<ChatProfileDto> getChatProfile(String userId) {
        return userRepository.findById(userId).map(u -> ChatProfileDto.builder()
                .id(u.getId())
                .username(u.getUsername())
                .email(u.getEmail())
                .role(Roles.normalize(u.getRole()))
                .profilePicture(u.getProfilePicture())
                .chatEnabled(u.isChatEnabled())
                .online(chatPresenceService.isOnline(u))
                .lastSeenAt(chatPresenceService.resolveLastSeen(u))
                .build());
    }

    private ChatUserSummary toChatUserSummary(User u) {
        return ChatUserSummary.builder()
                .id(u.getId())
                .username(u.getUsername())
                .role(Roles.normalize(u.getRole()))
                .profilePicture(u.getProfilePicture())
                .chatEnabled(u.isChatEnabled())
                .online(chatPresenceService.isOnline(u))
                .lastSeenAt(chatPresenceService.resolveLastSeen(u))
                .build();
    }

    public Optional<User> getUserById(String id) {
        return userRepository.findById(id);
    }

    public Optional<User> getUserByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public User createUserFromRequest(UserUpsertRequest request) {
        if (request.getUsername() == null || request.getUsername().isBlank()) {
            throw new RuntimeException("Username is required");
        }
        if (request.getEmail() == null || request.getEmail().isBlank()) {
            throw new RuntimeException("Email is required");
        }
        if (request.getPassword() == null || request.getPassword().isBlank()) {
            throw new RuntimeException("Password is required");
        }

        User user = new User();
        user.setUsername(request.getUsername().trim());
        user.setEmail(request.getEmail().trim());
        user.setPassword(request.getPassword());
        user.setProfilePicture(normalizeProfilePicture(request.getProfilePicture()));
        user.setEnabled(request.getEnabled() == null || Boolean.TRUE.equals(request.getEnabled()));
        user.setAccountNonExpired(request.getAccountNonExpired() == null || Boolean.TRUE.equals(request.getAccountNonExpired()));
        user.setAccountNonLocked(request.getAccountNonLocked() == null || Boolean.TRUE.equals(request.getAccountNonLocked()));
        user.setCredentialsNonExpired(request.getCredentialsNonExpired() == null || Boolean.TRUE.equals(request.getCredentialsNonExpired()));
        user.setChatEnabled(Boolean.TRUE.equals(request.getChatEnabled()));
        user.setChatPasscodeMustChange(Boolean.TRUE.equals(request.getChatPasscodeMustChange()));
        if (request.getRole() != null && !request.getRole().isBlank()) {
            user.setRole(Roles.normalize(request.getRole()));
        } else {
            user.setRole(Roles.USER);
        }
        return createUserInternal(user);
    }

    public User updateUserFromRequest(String id, UserUpsertRequest request) {
        User existingUser = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found with id: " + id));

        User user = new User();
        user.setUsername(request.getUsername() != null && !request.getUsername().isBlank()
                ? request.getUsername().trim()
                : existingUser.getUsername());
        user.setEmail(request.getEmail() != null && !request.getEmail().isBlank()
                ? request.getEmail().trim()
                : existingUser.getEmail());
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPassword(request.getPassword());
        }
        if (request.getProfilePicture() != null) {
            user.setProfilePicture(normalizeProfilePicture(request.getProfilePicture()));
        } else {
            user.setProfilePicture(existingUser.getProfilePicture());
        }
        user.setEnabled(request.getEnabled() != null ? request.getEnabled() : existingUser.isEnabled());
        user.setAccountNonExpired(request.getAccountNonExpired() != null
                ? request.getAccountNonExpired() : existingUser.isAccountNonExpired());
        user.setAccountNonLocked(request.getAccountNonLocked() != null
                ? request.getAccountNonLocked() : existingUser.isAccountNonLocked());
        user.setCredentialsNonExpired(request.getCredentialsNonExpired() != null
                ? request.getCredentialsNonExpired() : existingUser.isCredentialsNonExpired());
        user.setChatEnabled(request.getChatEnabled() != null
                ? request.getChatEnabled() : existingUser.isChatEnabled());
        user.setChatPasscodeMustChange(request.getChatPasscodeMustChange() != null
                ? request.getChatPasscodeMustChange() : existingUser.isChatPasscodeMustChange());
        if (request.getRole() != null && !request.getRole().isBlank()) {
            user.setRole(Roles.normalize(request.getRole()));
        } else {
            user.setRole(Roles.normalize(existingUser.getRole()));
        }
        return updateUser(id, user);
    }

    private String normalizeProfilePicture(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }

    public User createUser(User user) {
        user.setRole(Roles.USER);
        return createUserInternal(user);
    }

    private User createUserInternal(User user) {
        if (userRepository.existsByUsername(user.getUsername())) {
            throw new RuntimeException("Username already exists: " + user.getUsername());
        }
        if (userRepository.existsByEmail(user.getEmail())) {
            throw new RuntimeException("Email already exists: " + user.getEmail());
        }

        user.setRole(Roles.normalize(user.getRole()));

        String originalPassword = user.getPassword();
        user.setPassword(passwordEncoder.encode(user.getPassword()));

        User savedUser = userRepository.save(user);
        sendUserCredentialsEmail(savedUser, originalPassword);
        return savedUser;
    }

    public User updateUser(String id, User user) {
        if (!userRepository.existsById(id)) {
            throw new RuntimeException("User not found with id: " + id);
        }

        User existingUser = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found with id: " + id));

        user.setId(id);

        if (user.getRole() == null || user.getRole().isEmpty()) {
            user.setRole(Roles.normalize(existingUser.getRole()));
        } else {
            user.setRole(Roles.normalize(user.getRole()));
        }

        // Encode password if it's changed
        if (user.getPassword() != null && !user.getPassword().isEmpty() && !user.getPassword().startsWith("$2a$")) {
            user.setPassword(passwordEncoder.encode(user.getPassword()));
        } else if (user.getPassword() == null || user.getPassword().isEmpty()) {
            // Keep existing password if not provided
            user.setPassword(existingUser.getPassword());
        }

        if (user.getProfilePicture() == null) {
            user.setProfilePicture(existingUser.getProfilePicture());
        } else if (user.getProfilePicture().isEmpty()) {
            user.setProfilePicture(null);
        }

        // Preserve chat fields if not provided
        if (user.getChatPasscode() == null) {
            user.setChatPasscode(existingUser.getChatPasscode());
        }
        user.setChatEnabled(existingUser.isChatEnabled());
        user.setChatPasscodeMustChange(existingUser.isChatPasscodeMustChange());
        user.setChatFailedAttempts(existingUser.getChatFailedAttempts());
        user.setChatLockedUntil(existingUser.getChatLockedUntil());
        user.setChatSessionToken(existingUser.getChatSessionToken());
        user.setChatSessionExpiresAt(existingUser.getChatSessionExpiresAt());
        user.setWebAuthnCredentialId(existingUser.getWebAuthnCredentialId());

        return userRepository.save(user);
    }

    public void deleteUser(String id) {
        if (!userRepository.existsById(id)) {
            throw new RuntimeException("User not found with id: " + id);
        }
        userRepository.deleteById(id);
    }

    private void sendUserCredentialsEmail(User user, String originalPassword) {
        String subject = "Welcome to TaskFlow - Your Account Details";
        String body = getUserWelcomeBody(user, originalPassword);

        emailService.sendEmail(user.getEmail(), subject, body);
    }

    private String getUserWelcomeBody(User user, String originalPassword) {
        return """
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Welcome to TaskFlow</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
                    <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); overflow: hidden;">

                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #2563eb, #1e40af); padding: 40px 30px; text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 16px;">TaskFlow</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome aboard!</h1>
                            <p style="color: #93c5fd; margin: 8px 0 0 0; font-size: 16px;">Your account has been created successfully</p>
                        </div>

                        <!-- Content -->
                        <div style="padding: 40px 30px;">
                            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin-bottom: 30px; border-radius: 8px;">
                                <h2 style="color: #1e40af; margin: 0 0 16px 0; font-size: 20px;">Your Account Credentials</h2>
                                <div style="background: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <div style="margin-bottom: 16px;">
                                        <strong style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Username:</strong>
                                        <div style="font-size: 18px; font-weight: 600; color: #1e293b; margin-top: 4px;">%s</div>
                                    </div>
                                    <div style="margin-bottom: 16px;">
                                        <strong style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Password:</strong>
                                        <div style="font-size: 18px; font-weight: 600; color: #1e293b; margin-top: 4px;">%s</div>
                                    </div>
                                    <div>
                                        <strong style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Role:</strong>
                                        <div style="font-size: 18px; font-weight: 600; color: #1e293b; margin-top: 4px;">%s</div>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-bottom: 30px;">
                                <h3 style="color: #1e293b; margin: 0 0 12px 0; font-size: 18px;">Getting Started</h3>
                                <ul style="color: #64748b; line-height: 1.8; margin: 0; padding-left: 20px;">
                                    <li>Log in with your credentials above</li>
                                    <li>Create your first task to get started</li>
                                    <li>Organize tasks by priority and due dates</li>
                                    <li>Track your progress with analytics</li>
                                    <li>Set up email reminders for important tasks</li>
                                </ul>
                            </div>

                            <div style="text-align: center;">
                                <a href="%s/" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1e40af); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-bottom: 20px;">
                                    Launch TaskFlow
                                </a>
                                <p style="color: #94a3b8; font-size: 14px; margin: 0;">
                                    <strong>Important:</strong> Please change your password after first login for security
                                </p>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div style="background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="color: #64748b; margin: 0 0 8px 0; font-size: 14px;">
                                Need help? Contact our support team
                            </p>
                            <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                                This is an automated message. Please do not reply to this email.
                            </p>
                            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                                <p style="color: #64748b; margin: 0; font-size: 12px;">
                                    TaskFlow © 2026 | Built by Irasubiza Saly Nelson
                                </p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
                """
                .formatted(
                        user.getUsername(),
                        originalPassword,
                        user.getRole(),
                        frontendUrl.replaceAll("/$", ""));
    }
}
