import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import type BaziInfo from './BaziInfo';
import type Photo from './Photo';

class User extends Model {
  public id!: string;
  public username!: string;
  public nickname!: string;
  public email!: string;
  public password_hash!: string;
  public phone!: string | null;
  public phone_verified_at!: Date | null;
  public gender!: string;
  public birth_date!: Date;
  public is_verified!: boolean;
  public is_active!: boolean;
  public profile_completed!: boolean;
  public last_login_at!: Date | null;
  public last_login_ip!: string | null;
  
  // Profile Fields
  public mbti!: string;
  public interests!: string;
  public love_view!: string;
  public job!: string;
  public height!: number;
  public education!: string;
  public constellation!: string;
  public intro!: string;
  
  // New Fields from Screenshot
  public school!: string;
  public company!: string;
  public birth_place!: string;
  public hometown!: string;
  public moments!: string;
  public wishes!: string;
  public profile_extras!: string;

  // Login provider info
  public role!: string;
  public provider!: string;
  public provider_id!: string;
  public wechat_openid!: string | null;
  public wechat_unionid!: string | null;
  public avatar_url!: string;
  public im_user_id!: string | null;

  // Association fields
  public bazi_info?: BaziInfo;
  public photos?: Photo[];

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    nickname: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    phone_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    gender: {
      type: DataTypes.ENUM('male', 'female'),
      allowNull: false,
    },
    birth_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    profile_completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_login_ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Profile Fields
    mbti: { type: DataTypes.STRING, allowNull: true },
    interests: { type: DataTypes.TEXT, allowNull: true }, 
    love_view: { type: DataTypes.TEXT, allowNull: true },
    job: { type: DataTypes.STRING, allowNull: true },
    height: { type: DataTypes.INTEGER, allowNull: true },
    education: { type: DataTypes.STRING, allowNull: true },
    constellation: { type: DataTypes.STRING, allowNull: true },
    intro: { type: DataTypes.TEXT, allowNull: true },
    
    // New Fields
    school: { type: DataTypes.STRING, allowNull: true },
    company: { type: DataTypes.STRING, allowNull: true },
    birth_place: { type: DataTypes.STRING, allowNull: true },
    hometown: { type: DataTypes.STRING, allowNull: true },
    moments: { type: DataTypes.TEXT, allowNull: true },
    wishes: { type: DataTypes.TEXT, allowNull: true },
    profile_extras: { type: DataTypes.TEXT, allowNull: true },

    // Login provider info
    role: { 
      type: DataTypes.ENUM('user', 'admin'), 
      defaultValue: 'user' 
    },
    provider: { 
      type: DataTypes.ENUM('email', 'google', 'wechat'), 
      defaultValue: 'email' 
    },
    provider_id: { type: DataTypes.STRING, allowNull: true },
    wechat_openid: { type: DataTypes.STRING, allowNull: true, unique: true },
    wechat_unionid: { type: DataTypes.STRING, allowNull: true, unique: true },
    avatar_url: { type: DataTypes.STRING, allowNull: true },
    im_user_id: { type: DataTypes.STRING, allowNull: true, unique: true }
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default User;
