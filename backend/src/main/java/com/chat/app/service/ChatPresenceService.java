package com.chat.app.service;

import com.chat.app.model.User;
import com.chat.app.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ChatPresenceService {

    private static final long ONLINE_WINDOW_MS = 90_000;

    private final UserRepository userRepository;

    public void recordHeartbeat(String userId) {
        userRepository.findById(userId).ifPresent(user -> {
            long now = System.currentTimeMillis();
            user.setLastActiveAt(now);
            userRepository.save(user);
        });
    }

    public void touchLastSeen(String userId) {
        userRepository.findById(userId).ifPresent(user -> {
            user.setLastSeenAt(System.currentTimeMillis());
            userRepository.save(user);
        });
    }

    public boolean isOnline(User user) {
        if (user == null || user.getActiveTokenId() == null || user.getActiveTokenId().isBlank()) {
            return false;
        }
        Long active = user.getLastActiveAt();
        if (active == null) {
            return false;
        }
        return System.currentTimeMillis() - active < ONLINE_WINDOW_MS;
    }

    public Long resolveLastSeen(User user) {
        if (user == null) {
            return null;
        }
        if (isOnline(user)) {
            return null;
        }
        if (user.getLastSeenAt() != null) {
            return user.getLastSeenAt();
        }
        return user.getLastActiveAt();
    }
}
