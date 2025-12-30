export type TextSelection = {
  start: number;
  end: number;
};

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
  DEFAULT = ASC,
}

export const sortFactor: Record<SortDirection, 1 | -1 | 0> = {
  asc: 1,
  desc: -1,
};

export type SortDirectionConfig = SortDirection | 'normal';

export type SortItem = [field_uid: string, direction: SortDirectionConfig];

export type SortConfig = SortItem[];

export type AppVersion = `${number}.${number}.${number}`;
