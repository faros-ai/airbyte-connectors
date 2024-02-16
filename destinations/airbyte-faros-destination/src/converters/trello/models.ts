export type Action = {
  id?: string;
  idMemberCreator?: string;
  data?: {
    card?: {
      id?: string;
      name?: string;
      idShort?: number;
      shortLink?: string;
      pos?: number;
      desc?: string;
      closed?: boolean;
      idList?: string;
      idMembers?: ReadonlyArray<string>;
    };
    list?: {
      id?: string;
      name?: string;
      pos?: number;
      closed?: boolean;
    };
    board?: {
      id?: string;
      name?: string;
      shortLink?: string;
      prefs?: {
        background?: string;
      };
    };
    old?: {
      pos?: number;
      desc?: string;
      name?: string;
      closed?: boolean;
      idList?: string;
      prefs?: {
        background?: string;
      };
      idMembers?: ReadonlyArray<string>;
    };
    listBefore?: {
      id?: string;
      name?: string;
    };
    listAfter?: {
      id?: string;
      name?: string;
    };
    memberType?: string;
    idMemberAdded?: string;
    cardSource?: {
      id?: string;
      name?: string;
      idShort?: number;
      shortLink?: string;
    };
    idMemberInviter?: string;
    method?: string;
    idMember?: string;
    member?: {
      id?: string;
      name?: string;
    };
    deactivated?: boolean;
    text?: string;
    organization?: {
      id?: string;
      name?: string;
    };
  };
  type?: string;
  date?: string;
  memberCreator?: {
    id?: string;
    username?: string;
    activityBlocked?: boolean;
    avatarHash?: string;
    avatarUrl?: string;
    fullName?: string;
    idMemberReferrer?: string;
    initials?: string;
    nonPublicAvailable?: boolean;
  };
  member?: {
    id?: string;
    username?: string;
    activityBlocked?: boolean;
    avatarHash?: string;
    avatarUrl?: string;
    fullName?: string;
    idMemberReferrer?: string;
    initials?: string;
    nonPublicAvailable?: boolean;
  };
  limits?: {
    reactions?: {
      perAction?: {
        status?: string;
        disableAt?: number;
        warnAt?: number;
      };
      uniquePerAction?: {
        status?: string;
        disableAt?: number;
        warnAt?: number;
      };
    };
  };
};

export type Board = {
  name?: string;
  desc?: string;
  descData?: string;
  closed?: boolean;
  idOrganization?: string;
  idEnterprise?: string;
  limits?: {
    attachments?: {
      perBoard?: {
        status?: string;
        disableAt?: number;
        warnAt?: number;
      };
    };
  };
  pinned?: boolean;
  shortLink?: string;
  dateLastActivity?: string;
  datePluginDisable?: string;
  creationMethod?: string;
  ixUpdate?: string;
  enterpriseOwned?: boolean;
  idBoardSource?: string;
  id?: string;
  starred?: boolean;
  url?: string;
  powerUps?: ReadonlyArray<string>;
  premiumFeatures?: ReadonlyArray<string>;
  idTags?: ReadonlyArray<string>;
  prefs?: {
    permissionLevel?: string;
    hideVotes?: boolean;
    voting?: string;
    comments?: string;
    invitations?: string;
    selfJoin?: boolean;
    cardCovers?: boolean;
    isTemplate?: boolean;
    cardAging?: string;
    calendarFeedEnabled?: boolean;
    background?: string;
    backgroundImage?: string;
    backgroundImageScaled?: ReadonlyArray<{
      width?: number;
      height?: number;
      url?: string;
    }>;
    backgroundTile?: boolean;
    backgroundBrightness?: string;
    backgroundBottomColor?: string;
    backgroundTopColor?: string;
    canBePublic?: boolean;
    canBeEnterprise?: boolean;
    canBeOrg?: boolean;
    canBePrivate?: boolean;
    canInvite?: boolean;
  };
  subscribed?: boolean;
  labelNames?: {
    green?: string;
    yellow?: string;
    orange?: string;
    red?: string;
    purple?: string;
    blue?: string;
    sky?: string;
    lime?: string;
    pink?: string;
    black?: string;
  };
  dateLastView?: string;
  shortUrl?: string;
  templateGallery?: string;
  memberships?: ReadonlyArray<{
    id?: string;
    idMember?: string;
    memberType?: string;
    unconfirmed?: boolean;
    deactivated?: boolean;
  }>;
};

export type Card = {
  id?: string;
  start?: string;
  customFieldItems?: ReadonlyArray<{
    id?: string;
    idValue?: string;
    idCustomField?: string;
    idModel?: string;
    modelType?: string;
    value?: {
      checked?: string;
      date?: string;
      number?: string;
      text?: string;
      option?: string;
    };
  }>;
  idMembersVoted?: ReadonlyArray<string>;
  checkItemStates?: ReadonlyArray<unknown>;
  closed?: boolean;
  dateLastActivity?: string;
  desc?: string;
  descData?: {
    emoji?: unknown;
  };
  dueReminder?: string;
  idBoard?: string;
  idList?: string;
  idShort?: number;
  idAttachmentCover?: string;
  manualCoverAttachment?: boolean;
  name?: string;
  pos?: number;
  shortLink?: string;
  isTemplate?: boolean;
  badges?: {
    attachmentsByType?: {
      trello?: {
        board?: number;
        card?: number;
      };
    };
    location?: boolean;
    votes?: number;
    viewingMemberVoted?: boolean;
    subscribed?: boolean;
    fogbugz?: string;
    checkItems?: number;
    checkItemsChecked?: number;
    checkItemsEarliestDue?: string;
    comments?: number;
    attachments?: number;
    description?: boolean;
    due?: string;
    dueComplete?: boolean;
  };
  dueComplete?: boolean;
  due?: string;
  shortUrl?: string;
  subscribed?: boolean;
  url?: string;
  cover?: {
    idAttachment?: string;
    color?: string;
    idUploadedBackground?: string;
    size?: string;
    brightness?: string;
    edgeColor?: string;
    sharedSourceUrl?: string;
    idPlugin?: string;
  };
  idChecklists?: ReadonlyArray<string>;
  idMembers?: ReadonlyArray<string>;
  idLabels?: ReadonlyArray<string>;
  labels?: ReadonlyArray<{
    id?: string;
    idBoard?: string;
    name?: string;
    color?: string;
  }>;
};

export type User = {
  id?: string;
  boardId?: string;
  username?: string;
  fullName?: string;
};
