package com.chat.app.controller;

import com.chat.app.dto.ChatUserSummary;
import com.chat.app.dto.UserUpsertRequest;
import com.chat.app.model.User;
import com.chat.app.repository.UserRepository;
import com.chat.app.security.Roles;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.chat.app.service.ChatSecurityService;
import com.chat.app.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserRepository userRepository;
    private final ChatSecurityService chatSecurityService;
    private final PasswordEncoder passwordEncoder;

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    @GetMapping("/chat")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ChatUserSummary>> getUsersForChat(Authentication authentication) {
        String excludeId = userRepository.findByUsername(authentication.getName())
                .map(User::getId)
                .orElse(null);
        return ResponseEntity.ok(userService.getChatDirectoryUsers(excludeId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<User> getUserById(@PathVariable String id) {
        Optional<User> user = userService.getUserById(id);
        return user.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<?> createUser(@RequestBody UserUpsertRequest request) {
        try {
            User createdUser = userService.createUserFromRequest(request);
            return ResponseEntity.ok(createdUser);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<?> updateUser(@PathVariable String id, @RequestBody UserUpsertRequest request) {
        try {
            User updatedUser = userService.updateUserFromRequest(id, request);
            return ResponseEntity.ok(updatedUser);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<?> deleteUser(@PathVariable String id) {
        try {
            userService.deleteUser(id);
            return ResponseEntity.ok().body("User deleted successfully");
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getCurrentUser() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth.getName();

            Optional<User> user = userService.getUserByUsername(username);
            if (user.isPresent()) {
                return ResponseEntity.ok(chatSecurityService.toMeResponse(user.get()));
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error retrieving user information");
        }
    }

    @PostMapping("/avatar")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> uploadAvatar(@RequestParam("avatar") MultipartFile file) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth.getName();

            Optional<User> userOpt = userService.getUserByUsername(username);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            User user = userOpt.get();

            // Validate file
            if (file.isEmpty()) {
                return ResponseEntity.badRequest().body("File is empty");
            }

            if (!file.getContentType().startsWith("image/")) {
                return ResponseEntity.badRequest().body("File must be an image");
            }

            if (file.getSize() > 5 * 1024 * 1024) {
                return ResponseEntity.badRequest().body("File size must be less than 5MB");
            }

            // For now, store as base64 (in production, you'd use cloud storage)
            byte[] bytes = file.getBytes();
            String base64Image = java.util.Base64.getEncoder().encodeToString(bytes);
            String dataUrl = "data:" + file.getContentType() + ";base64," + base64Image;

            // Update user with profile picture
            user.setProfilePicture(dataUrl);
            userService.updateUser(user.getId(), user);

            return ResponseEntity.ok().body(Map.of("profilePicture", dataUrl));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error uploading avatar: " + e.getMessage());
        }
    }

    @PostMapping("/change-password")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> request) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth.getName();

            Optional<User> userOpt = userService.getUserByUsername(username);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            User user = userOpt.get();
            String currentPassword = request.get("currentPassword");
            String newPassword = request.get("newPassword");

            // Validate current password
            if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
                return ResponseEntity.badRequest().body("Current password is incorrect");
            }

            // Validate new password
            if (newPassword == null || newPassword.length() < 6) {
                return ResponseEntity.badRequest().body("New password must be at least 6 characters long");
            }

            // Update password
            user.setPassword(passwordEncoder.encode(newPassword));
            userService.updateUser(user.getId(), user);

            return ResponseEntity.ok().body("Password changed successfully");
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error changing password: " + e.getMessage());
        }
    }

    @PutMapping("/{id}/chat-access")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<?> updateChatAccess(@PathVariable String id, @RequestBody Map<String, Object> request) {
        try {
            Optional<User> userOpt = userService.getUserById(id);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            User user = userOpt.get();
            if (request.containsKey("chatEnabled")) {
                boolean enabled = Boolean.TRUE.equals(request.get("chatEnabled"));
                user.setChatEnabled(enabled);
                if (enabled) {
                    chatSecurityService.onChatEnabled(user);
                } else {
                    chatSecurityService.clearChatSession(user);
                }
            }
            if (request.containsKey("chatPasscode")) {
                String passcode = (String) request.get("chatPasscode");
                if (passcode != null && !passcode.isBlank()) {
                    if (!ChatSecurityService.isValidPasscodeFormat(passcode)) {
                        return ResponseEntity.badRequest().body("Passcode must be exactly 6 letters or numbers");
                    }
                    chatSecurityService.onAdminPasscodeReset(user, passcode.trim());
                }
            }
            userRepository.save(user);
            return ResponseEntity.ok(user);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error updating chat access: " + e.getMessage());
        }
    }

    @PostMapping("/verify-chat-passcode")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> verifyChatPasscode(@RequestBody Map<String, String> request) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            Optional<User> userOpt = userService.getUserByUsername(auth.getName());
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            ChatSecurityService.VerifyResult result = chatSecurityService.verifyPasscode(
                    userOpt.get(),
                    request.get("passcode")
            );
            if (result.success()) {
                return ResponseEntity.ok(Map.of(
                        "success", true,
                        "mustChangePasscode", result.mustChangePasscode(),
                        "chatSessionToken", result.chatSessionToken()
                ));
            }
            return ResponseEntity.status(401).body(Map.of(
                    "success", false,
                    "message", result.message(),
                    "remainingAttempts", result.remainingAttempts(),
                    "lockedUntil", result.lockedUntil() != null ? result.lockedUntil() : 0
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error verifying passcode");
        }
    }

    @PostMapping("/change-chat-passcode")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> changeChatPasscode(@RequestBody Map<String, String> request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Optional<User> userOpt = userService.getUserByUsername(auth.getName());
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ChatSecurityService.VerifyResult result = chatSecurityService.changeOwnPasscode(
                userOpt.get(),
                request.get("newPasscode")
        );
        if (result.success()) {
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "chatSessionToken", result.chatSessionToken()
            ));
        }
        return ResponseEntity.badRequest().body(Map.of("success", false, "message", result.message()));
    }

    @GetMapping("/webauthn/register-options")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> webAuthnRegisterOptions() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String challenge = chatSecurityService.createWebAuthnChallenge(auth.getName());
        return ResponseEntity.ok(Map.of(
                "challenge", challenge,
                "rp", Map.of("name", "TaskFlow", "id", "localhost"),
                "user", Map.of("name", auth.getName(), "displayName", auth.getName()),
                "pubKeyCredParams", new Object[] { Map.of("type", "public-key", "alg", -7) },
                "authenticatorSelection", Map.of(
                        "authenticatorAttachment", "platform",
                        "userVerification", "required"
                ),
                "timeout", 60000
        ));
    }

    @PostMapping("/webauthn/register")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> webAuthnRegister(@RequestBody Map<String, String> request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Optional<User> userOpt = userService.getUserByUsername(auth.getName());
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ChatSecurityService.VerifyResult result = chatSecurityService.registerWebAuthn(
                userOpt.get(),
                request.get("credentialId"),
                request.get("challenge")
        );
        if (result.success()) {
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "chatSessionToken", result.chatSessionToken()
            ));
        }
        return ResponseEntity.badRequest().body(Map.of("success", false, "message", result.message()));
    }

    @GetMapping("/webauthn/verify-options")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> webAuthnVerifyOptions() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Optional<User> userOpt = userService.getUserByUsername(auth.getName());
        if (userOpt.isEmpty() || userOpt.get().getWebAuthnCredentialId() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Biometric not registered"));
        }
        String challenge = chatSecurityService.createWebAuthnChallenge(auth.getName());
        return ResponseEntity.ok(Map.of(
                "challenge", challenge,
                "allowCredentials", new Object[] {
                        Map.of(
                                "type", "public-key",
                                "id", userOpt.get().getWebAuthnCredentialId()
                        )
                },
                "timeout", 60000,
                "userVerification", "required"
        ));
    }

    @PostMapping("/webauthn/verify")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> webAuthnVerify(@RequestBody Map<String, String> request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Optional<User> userOpt = userService.getUserByUsername(auth.getName());
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ChatSecurityService.VerifyResult result = chatSecurityService.verifyWebAuthn(
                userOpt.get(),
                request.get("credentialId"),
                request.get("challenge")
        );
        if (result.success()) {
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "mustChangePasscode", result.mustChangePasscode(),
                    "chatSessionToken", result.chatSessionToken()
            ));
        }
        return ResponseEntity.status(401).body(Map.of(
                "success", false,
                "message", result.message(),
                "remainingAttempts", result.remainingAttempts(),
                "lockedUntil", result.lockedUntil() != null ? result.lockedUntil() : 0
        ));
    }
}
