package com.chat.app.security;

/**
 * Application roles:
 * USER — chat only (when chatEnabled)
 * ADMIN — task manager sidebar (no chat, admin portal, timetables)
 * SUPER_ADMIN — full access
 */
public final class Roles {

    public static final String USER = "USER";
    public static final String ADMIN = "ADMIN";
    public static final String SUPER_ADMIN = "SUPER_ADMIN";

    private Roles() {
    }

    public static String normalize(String role) {
        if (role == null || role.isBlank()) {
            return USER;
        }
        role = role.trim();
        if (SUPER_ADMIN.equalsIgnoreCase(role) || "SUPERADMIN".equalsIgnoreCase(role)) {
            return SUPER_ADMIN;
        }
        if (ADMIN.equalsIgnoreCase(role)) {
            return ADMIN;
        }
        return USER;
    }

    public static boolean isSuperAdmin(String role) {
        return SUPER_ADMIN.equals(normalize(role));
    }

    public static boolean isAdmin(String role) {
        return ADMIN.equals(normalize(role));
    }

    public static boolean isUser(String role) {
        return USER.equals(normalize(role));
    }

    public static boolean isStaff(String role) {
        return isAdmin(role) || isSuperAdmin(role);
    }

    public static boolean canUseTaskManager(String role) {
        return isStaff(role);
    }

    public static boolean canUseChat(String role, boolean chatEnabled) {
        if (isSuperAdmin(role)) {
            return true;
        }
        if (isAdmin(role)) {
            return false;
        }
        return isUser(role) && chatEnabled;
    }
}
