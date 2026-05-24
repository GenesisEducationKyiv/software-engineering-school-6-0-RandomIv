export interface RepositoryEntity {
  id: string;
  fullName: string;
  lastSeenTag: string | null;
  updatedAt: Date;
}
