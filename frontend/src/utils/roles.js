export const ROLES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
};

export const normalizeRole = (role) => {
  if (!role) return ROLES.USER;
  if (role === 'SUPER_ADMIN' || role === 'SUPERADMIN') return ROLES.SUPER_ADMIN;
  if (role === 'ADMIN') return ROLES.ADMIN;
  return ROLES.USER;
};

export const getRoleFlags = (role) => {
  const r = normalizeRole(role);
  const isSuperAdmin = r === ROLES.SUPER_ADMIN;
  const isAdmin = r === ROLES.ADMIN;
  const isUser = r === ROLES.USER;
  const isStaff = isAdmin || isSuperAdmin;

  return {
    role: r,
    isSuperAdmin,
    isAdmin,
    isUser,
    isStaff,
    canLeaveChat: isSuperAdmin,
    canAccessAdminPortal: isSuperAdmin,
    canAccessChatNav: isSuperAdmin,
    canAccessTimetables: isSuperAdmin,
    canBypassChatPasscode: isSuperAdmin,
    canUseTaskManager: isStaff,
  };
};

const TIMETABLE_PAGES = new Set([
  'timetables',
  'class_timetable',
  'cat_timetable',
  'national_exam',
  'dining_timetable',
]);

/** Whether a sidebar page id is allowed for this role */
export const canAccessPage = (role, pageId) => {
  const flags = getRoleFlags(role);

  if (flags.isUser) {
    return pageId === 'chat';
  }

  if (flags.isAdmin) {
    if (pageId === 'chat' || pageId === 'admin') return false;
    if (TIMETABLE_PAGES.has(pageId)) return false;
    return true;
  }

  if (flags.isSuperAdmin) {
    return true;
  }

  return false;
};

/** USER with chat goes straight to chat; staff land on dashboard */
export const getDefaultPageForUser = (user) => {
  const flags = getRoleFlags(user?.role);
  if (flags.isUser) {
    return user?.chatEnabled ? 'chat' : 'chat';
  }
  return 'dashboard';
};

export const isChatOnlyUser = (user) =>
  getRoleFlags(user?.role).isUser && !!user?.chatEnabled;

/** Direct messages / chat picker — USER (chat enabled) and SUPER_ADMIN only; never ADMIN */
export const canAppearInChatList = (role, chatEnabled = false) => {
  const r = normalizeRole(role);
  if (r === ROLES.ADMIN) return false;
  if (r === ROLES.SUPER_ADMIN) return true;
  if (r === ROLES.USER) return !!chatEnabled;
  return false;
};
