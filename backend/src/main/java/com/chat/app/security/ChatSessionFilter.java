package com.chat.app.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.chat.app.service.ChatSecurityService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class ChatSessionFilter extends OncePerRequestFilter {

    private final ChatSecurityService chatSecurityService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        // Chat directory: JWT auth only (sidebar loads after login / passcode UI handles the rest)
        if ("GET".equalsIgnoreCase(method)
                && ("/api/chat/users".equals(path) || "/api/users/chat".equals(path))) {
            return true;
        }
        return !path.startsWith("/api/chat/") && !"/api/users/chat".equals(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            filterChain.doFilter(request, response);
            return;
        }

        String username = auth.getName();
        String sessionHeader = request.getHeader("X-Chat-Session");

        if (chatSecurityService.hasChatApiAccess(username, sessionHeader)) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), Map.of(
                "success", false,
                "message", "Chat passcode verification required",
                "code", "CHAT_SESSION_REQUIRED"
        ));
    }
}
