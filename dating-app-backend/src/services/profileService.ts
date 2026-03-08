import { User } from '../models';

export type ProfileState = {
  completed: boolean;
  missing_fields: string[];
};

export const getProfileState = (user: User): ProfileState => {
  const missing: string[] = [];

  if (!user.nickname) missing.push('nickname');
  if (!user.gender) missing.push('gender');
  if (!user.birth_date) missing.push('birthday');
  if (!user.hometown) missing.push('birth_place');

  return {
    completed: missing.length === 0,
    missing_fields: missing,
  };
};

