export interface Email {
  index: number;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface ParseResult {
  sequenceName: string;
  emails: Email[];
}
