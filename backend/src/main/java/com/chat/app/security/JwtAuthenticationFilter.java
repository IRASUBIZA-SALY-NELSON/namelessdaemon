package com.chat.app.security;

import com.chat.app.model.User;
import com.chat.app.repository.UserRepository;
import com.chat.app.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private UserDetailsService userDetailsService;

    @Autowired
    private UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        final String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String jwtToken = authHeader.substring(7);
        String username = null;

        try {
            username = jwtUtil.getUsernameFromToken(jwtToken);
        } catch (Exception e) {
            logger.error("Unable to get JWT Token");
        }

        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            if (jwtUtil.validateToken(jwtToken)) {
                String tokenId = jwtUtil.getTokenIdFromToken(jwtToken);
                Optional<User> userOpt = userRepository.findByUsername(username);

                boolean sessionValid = userOpt.map(u -> {
                    String activeId = u.getActiveTokenId();
                    if (activeId == null || activeId.isBlank()) {
                        if (tokenId != null && !tokenId.isBlank()) {
                            u.setActiveTokenId(tokenId);
                            userRepository.save(u);
                        }
                        return true;
                    }
                    if (tokenId == null || tokenId.isBlank()) {
                        return false;
                    }
                    return tokenId.equals(activeId);
                }).orElse(false);

                if (sessionValid) {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(
                                    userDetails, null, userDetails.getAuthorities());
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                } else {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/json");
                    response.getWriter().write("{\"error\":\"Session expired. Please log in again.\",\"code\":\"JWT_SESSION_EXPIRED\"}");
                    return;
                }
            }
        }

        filterChain.doFilter(request, response);
    }
}
