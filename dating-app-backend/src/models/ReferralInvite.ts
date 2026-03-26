import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class ReferralInvite extends Model {
  public id!: string;
  public inviter_id!: string;
  public invitee_id!: string;
  public referral_code!: string;
  public status!: string;
  public invited_ip!: string | null;
  public verified_at!: Date | null;
  public rewarded_at!: Date | null;
  public reward_status!: string;
  public reward_reason!: string | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

ReferralInvite.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    inviter_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    invitee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    referral_code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('registered', 'verified', 'rejected'),
      allowNull: false,
      defaultValue: 'registered',
    },
    invited_ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rewarded_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reward_status: {
      type: DataTypes.ENUM('pending', 'issued', 'blocked'),
      allowNull: false,
      defaultValue: 'pending',
    },
    reward_reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'referral_invites',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { fields: ['inviter_id', 'status'] },
      { fields: ['referral_code'] },
    ],
  }
);

export default ReferralInvite;
