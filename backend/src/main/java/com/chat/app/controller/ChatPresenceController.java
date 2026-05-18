package com.chat.app.controller;

import com.chat.app.model.User;
import com.chat.app.repository.UserRepository;
import com.chat.app.service.ChatPresenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chat/presence")
@RequiredArgsConstructor
public class ChatPresenceController {

    private final UserRepository userRepository;
    private final ChatPresenceService chatPresenceService;

    @PostMapping("/heartbeat")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> heartbeat(Authentication authentication) {
        userRepository.findByUsername(authentication.getName())
                .map(User::getId)
                .ifPresent(chatPresenceService::recordHeartbeat);
        return ResponseEntity.ok().build();
    }
}
