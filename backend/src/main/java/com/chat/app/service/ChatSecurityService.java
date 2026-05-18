package com.chat.app.service;

import com.chat.app.dto.UserMeResponse;
import com.chat.app.model.User;
import com.chat.app.security.Roles;
import com.chat.app.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class ChatSecurityService {

    public static final String DEFAULT_PASSCODE = "123456";
    public static final int MAX_FAILED_ATTEMPTS = 5;
    public static final long LOCK_DURATION_MS = 15 * 60 * 1000L;
    public static final long SESSION_DURATION_MS = 24 * 60 * 60 * 1000L;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final Map<String, ChallengeEntry> webAuthnChallenges = new ConcurrentHashMap<>();

    public record ChallengeEntry(String challenge, long expiresAt) {}

    public record VerifyResult(
            boolean success,
            String message,
            boolean mustChangePasscode,
            String chatSessionToken,
            int remainingAttempts,
            Long lockedUntil
    ) {}

    public static boolean isValidPasscodeFormat(String passcode) {
        if (passcode == null) {
            return false;
        }
        String trimmed = passcode.trim();
        return trimmed.length() == 6 && trimmed.matches("^[a-zA-Z0-9]{6}$");
    }

    public void applyDefaultPasscodeIfNeeded(User user) {
        if (user.getChatPasscode() == null || user.getChatPasscode().isBlank()) {
            user.setChatPasscode(DEFAULT_PASSCODE);
            user.setChatPasscodeMustChange(true);
        }
    }

    public void onChatEnabled(User user) {
        applyDefaultPasscodeIfNeeded(user);
        user.setChatFailedAttempts(0);
        user.setChatLockedUntil(null);
    }

    public void onAdminPasscodeReset(User user, String passcode) {
        user.setChatPasscode(passcode);
        user.setChatPasscodeMustChange(true);
        user.setChatFailedAttempts(0);
        user.setChatLockedUntil(null);
        clearChatSession(user);
    }

    public void clearChatSession(User user) {
        user.setChatSessionToken(null);
        user.setChatSessionExpiresAt(null);
    }

    public boolean isChatSessionValid(User user) {
        if (user.getChatSessionToken() == null || user.getChatSessionExpiresAt() == null) {
            return false;
        }
        return System.currentTimeMillis() < user.getChatSessionExpiresAt();
    }

    public boolean isPasscodeLocked(User user) {
        if (user.getChatLockedUntil() == null) {
            return false;
        }
        if (System.currentTimeMillis() >= user.getChatLockedUntil()) {
            user.setChatLockedUntil(null);
            user.setChatFailedAttempts(0);
            userRepository.save(user);
            return false;
        }
        return true;
    }

    public VerifyResult verifyPasscode(User user, String inputPasscode) {
        if (Roles.isAdmin(user.getRole())) {
            return new VerifyResult(false, "Chat is not available for ADMIN accounts", false, null, 0, null);
        }
        if (!user.isChatEnabled() && Roles.isUser(user.getRole())) {
            return new VerifyResult(false, "Chat access is not enabled for your account", false, null, 0, null);
        }

        if (isPasscodeLocked(user)) {
            return new VerifyResult(
                    false,
                    "Too many failed attempts. Try again later.",
                    false,
                    null,
                    0,
                    user.getChatLockedUntil()
            );
        }

        String expected = user.getChatPasscode();
        if (expected == null || expected.isBlank()) {
            applyDefaultPasscodeIfNeeded(user);
            expected = user.getChatPasscode();
            userRepository.save(user);
        }

        if (inputPasscode != null && inputPasscode.equals(expected)) {
            user.setChatFailedAttempts(0);
            user.setChatLockedUntil(null);
            String sessionToken = issueChatSession(user);
            User saved = userRepository.save(user);
            if (!sessionToken.equals(saved.getChatSessionToken())) {
                return new VerifyResult(false, "Could not start chat session. Try again.", false, null, 0, null);
            }
            return new VerifyResult(
                    true,
                    "Verified",
                    user.isChatPasscodeMustChange(),
                    sessionToken,
                    MAX_FAILED_ATTEMPTS,
                    null
            );
        }

        int attempts = user.getChatFailedAttempts() + 1;
        user.setChatFailedAttempts(attempts);
        Long lockedUntil = null;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
            lockedUntil = System.currentTimeMillis() + LOCK_DURATION_MS;
            user.setChatLockedUntil(lockedUntil);
        }
        userRepository.save(user);

        int remaining = Math.max(0, MAX_FAILED_ATTEMPTS - attempts);
        String message = attempts >= MAX_FAILED_ATTEMPTS
                ? "Account locked for 15 minutes after 5 failed attempts."
                : "Incorrect passcode. " + remaining + " attempt(s) remaining.";

        return new VerifyResult(false, message, false, null, remaining, lockedUntil);
    }

    public VerifyResult changeOwnPasscode(User user, String newPasscode) {
        if (!isValidPasscodeFormat(newPasscode)) {
            return new VerifyResult(false, "Passcode must be exactly 6 letters or numbers", false, null, 0, null);
        }
        if (DEFAULT_PASSCODE.equals(newPasscode)) {
            return new VerifyResult(false, "Choose a passcode other than the default 123456", false, null, 0, null);
        }
        user.setChatPasscode(newPasscode);
        user.setChatPasscodeMustChange(false);
        user.setChatFailedAttempts(0);
        user.setChatLockedUntil(null);
        String sessionToken = issueChatSession(user);
        userRepository.save(user);
        return new VerifyResult(true, "Passcode updated", false, sessionToken, MAX_FAILED_ATTEMPTS, null);
    }

    public String issueChatSession(User user) {
        String token = UUID.randomUUID().toString().replace("-", "");
        user.setChatSessionToken(token);
        user.setChatSessionExpiresAt(System.currentTimeMillis() + SESSION_DURATION_MS);
        return token;
    }

    public Optional<User> validateChatSession(String username, String sessionToken) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return Optional.empty();
        }
        User user = userOpt.get();
        if (Roles.isSuperAdmin(user.getRole())) {
            return userOpt;
        }
        if (Roles.isAdmin(user.getRole())) {
            return Optional.empty();
        }
        if (!user.isChatEnabled()) {
            return Optional.empty();
        }
        if (sessionToken == null || sessionToken.isBlank()) {
            return Optional.empty();
        }
        if (!sessionToken.equals(user.getChatSessionToken()) || !isChatSessionValid(user)) {
            return Optional.empty();
        }
        return userOpt;
    }

    public boolean hasChatApiAccess(String username, String sessionToken) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent() && Roles.isSuperAdmin(userOpt.get().getRole())) {
            return true;
        }
        return validateChatSession(username, sessionToken).isPresent();
    }

    public UserMeResponse toMeResponse(User user) {
        return UserMeResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .role(user.getRole())
                .profilePicture(user.getProfilePicture())
                .chatEnabled(user.isChatEnabled())
                .chatPasscodeMustChange(user.isChatPasscodeMustChange())
                .chatPasscodeLocked(isPasscodeLocked(user))
                .chatLockedUntil(user.getChatLockedUntil())
                .chatFailedAttempts(user.getChatFailedAttempts())
                .webAuthnRegistered(user.getWebAuthnCredentialId() != null && !user.getWebAuthnCredentialId().isBlank())
                .chatSessionActive(isChatSessionValid(user))
                .build();
    }

    public String createWebAuthnChallenge(String username) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        webAuthnChallenges.put(username, new ChallengeEntry(challenge, System.currentTimeMillis() + 5 * 60 * 1000L));
        return challenge;
    }

    public boolean consumeWebAuthnChallenge(String username, String challenge) {
        ChallengeEntry entry = webAuthnChallenges.remove(username);
        if (entry == null) {
            return false;
        }
        if (System.currentTimeMillis() > entry.expiresAt()) {
            return false;
        }
        return entry.challenge().equals(challenge);
    }

    public VerifyResult registerWebAuthn(User user, String credentialId, String challenge) {
        if (!consumeWebAuthnChallenge(user.getUsername(), challenge)) {
            return new VerifyResult(false, "Registration challenge expired. Try again.", false, null, 0, null);
        }
        if (credentialId == null || credentialId.isBlank()) {
            return new VerifyResult(false, "Invalid credential", false, null, 0, null);
        }
        user.setWebAuthnCredentialId(credentialId);
        user.setChatPasscodeMustChange(false);
        user.setChatFailedAttempts(0);
        user.setChatLockedUntil(null);
        String sessionToken = issueChatSession(user);
        userRepository.save(user);
        return new VerifyResult(true, "Biometric registered", false, sessionToken, MAX_FAILED_ATTEMPTS, null);
    }

    public VerifyResult verifyWebAuthn(User user, String credentialId, String challenge) {
        if (isPasscodeLocked(user)) {
            return new VerifyResult(false, "Too many failed attempts. Try again later.", false, null, 0, user.getChatLockedUntil());
        }
        if (!consumeWebAuthnChallenge(user.getUsername(), challenge)) {
            return new VerifyResult(false, "Authentication challenge expired. Try again.", false, null, 0, null);
        }
        if (user.getWebAuthnCredentialId() == null || !user.getWebAuthnCredentialId().equals(credentialId)) {
            int attempts = user.getChatFailedAttempts() + 1;
            user.setChatFailedAttempts(attempts);
            Long lockedUntil = null;
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                lockedUntil = System.currentTimeMillis() + LOCK_DURATION_MS;
                user.setChatLockedUntil(lockedUntil);
            }
            userRepository.save(user);
            int remaining = Math.max(0, MAX_FAILED_ATTEMPTS - attempts);
            return new VerifyResult(false, "Biometric verification failed. " + remaining + " attempt(s) remaining.", false, null, remaining, lockedUntil);
        }
        user.setChatFailedAttempts(0);
        user.setChatLockedUntil(null);
        String sessionToken = issueChatSession(user);
        userRepository.save(user);
        return new VerifyResult(true, "Verified", user.isChatPasscodeMustChange(), sessionToken, MAX_FAILED_ATTEMPTS, null);
    }
}
