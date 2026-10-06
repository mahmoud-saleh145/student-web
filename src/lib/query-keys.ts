export const qk = {
  auth: {
    all: ['auth'] as const,
    me: () => [...qk.auth.all, 'me'] as const,
    session: () => [...qk.auth.all, 'session'] as const,
    profile: () => [...qk.auth.all, 'profile'] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    universities: () => [...qk.catalog.all, 'universities'] as const,
    faculties: (universityId: string) => [...qk.catalog.all, 'faculties', universityId] as const,
    departments: (facultyId: string) => [...qk.catalog.all, 'departments', facultyId] as const,
    academicYears: () => [...qk.catalog.all, 'academic-years'] as const,
  },
  home: {
    all: ['home'] as const,
    feed: () => [...qk.home.all, 'feed'] as const,
  },
  courses: {
    all: ['courses'] as const,
    list: (filters: object) => [...qk.courses.all, 'list', filters] as const,
    detail: (id: string) => [...qk.courses.all, 'detail', id] as const,
    mine: (filters: object) => [...qk.courses.all, 'mine', filters] as const,
    progress: (id: string) => [...qk.courses.all, 'progress', id] as const,
    parts: (id: string) => [...qk.courses.all, 'parts', id] as const,
    joinOptions: (id: string) => [...qk.courses.all, 'join-options', id] as const,
    sectionAttachments: (id: string) => [...qk.courses.all, 'section-attachments', id] as const,
    playAllowance: (videoId: string) => [...qk.courses.all, 'play-allowance', videoId] as const,
    myParts: (filters: object) => [...qk.courses.all, 'my-parts', filters] as const,
  },
  lessons: {
    all: ['lessons'] as const,
    detail: (id: string) => [...qk.lessons.all, 'detail', id] as const,
    byVideo: (videoId: string) => [...qk.lessons.all, 'by-video', videoId] as const,
  },
  playback: {
    all: ['playback'] as const,
    ticket: (videoId: string) => [...qk.playback.all, 'ticket', videoId] as const,
  },
  attachments: {
    all: ['attachments'] as const,
    ticket: (id: string) => [...qk.attachments.all, 'ticket', id] as const,
  },
  progress: {
    all: ['progress'] as const,
    continueWatching: () => [...qk.progress.all, 'continue-watching'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (filters: object) => [...qk.notifications.all, 'list', filters] as const,
    unread: () => [...qk.notifications.all, 'unread-count'] as const,
    preferences: () => [...qk.notifications.all, 'preferences'] as const,
  },
  search: {
    all: ['search'] as const,
    query: (q: string, entity?: string) => [...qk.search.all, 'query', q, entity ?? 'all'] as const,
    suggestions: (q: string) => [...qk.search.all, 'suggestions', q] as const,
  },
  devices: {
    all: ['devices'] as const,
    list: () => [...qk.devices.all, 'list'] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    summary: () => [...qk.wallet.all, 'summary'] as const,
    transactions: (filters: object) => [...qk.wallet.all, 'transactions', filters] as const,
  },
  library: {
    all: ['library'] as const,
    browse: (filters: object) => [...qk.library.all, 'browse', filters] as const,
    material: (id: string) => [...qk.library.all, 'material', id] as const,
    mine: (filters: object) => [...qk.library.all, 'mine', filters] as const,
    purchases: (filters: object) => [...qk.library.all, 'purchases', filters] as const,
    document: (partId: string) => [...qk.library.all, 'document', partId] as const,
  },
  support: {
    all: ['support'] as const,
    tickets: (filters: object) => [...qk.support.all, 'tickets', filters] as const,
    ticket: (id: string) => [...qk.support.all, 'ticket', id] as const,
  },
} as const;
