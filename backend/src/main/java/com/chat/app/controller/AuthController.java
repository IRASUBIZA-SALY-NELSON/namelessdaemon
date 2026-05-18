package com.chat.app.controller;

import com.chat.app.repository.UserRepository;
import com.chat.app.service.ChatPresenceService;
import com.chat.app.service.ChatSecurityService;
import com.chat.app.service.UserService;
import com.chat.app.util.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserService userService;

    @Autowired
    private ChatSecurityService chatSecurityService;

    @Autowired
    private ChatPresenceService chatPresenceService;

    @PostMapping("/login")
    public ResponseEntity<?> createAuthenticationToken(@RequestBody Map<String, String> loginRequest) {
        try {
            String username = loginRequest.get("username");
            String password = loginRequest.get("password");

            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, password));

            UserDetails userDetails = (UserDetails) authentication.getPrincipal();

            String tokenId = UUID.randomUUID().toString();
            String jwt = jwtUtil.generateToken(userDetails.getUsername(), tokenId);

            // Save tokenId — invalidates any previous session for this user
            userRepository.findByUsername(username).ifPresent(user -> {
                user.setActiveTokenId(tokenId);
                long now = System.currentTimeMillis();
                user.setLastActiveAt(now);
                userRepository.save(user);
            });

            String role= userDetails.getAuthorities().stream()
                    .findFirst()
                    .map(a -> a.getAuthority())
                    .orElse("ROLE_USER");

            Map<String, String> response = new HashMap<>();
            response.put("token", jwt);
            response.put("role", role.replace("ROLE_", ""));

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Invalid credentials");
            return ResponseEntity.status(401).body(errorResponse);
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logoutUser(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                String username = jwtUtil.getUsernameFromToken(token);
                userRepository.findByUsername(username).ifPresent(user -> {
                    chatPresenceService.touchLastSeen(user.getId());
                    user.setActiveTokenId(null);
                    chatSecurityService.clearChatSession(user);
                    userRepository.save(user);
                });
            } catch (Exception ignored) {
            }
        }
        Map<String, String> response = new HashMap<>();
        response.put("message", "Logged out successfully");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        try {
            userService.requestPasswordReset(email);
            Map<String, String> response = new HashMap<>();
            response.put("message", "Instructions sent to " + email);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> response = new HashMap<>();
            response.put("message", "Instructions sent if account exists");
            return ResponseEntity.ok(response);
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> request) {
        String token = request.get("token");
        String newPassword = request.get("newPassword");
        try {
            userService.resetPassword(token, newPassword);
            Map<String, String> response = new HashMap<>();
            response.put("message", "Password reset successful");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> response = new HashMap<>();
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
}
