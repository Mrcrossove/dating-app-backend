import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';
import ReferralInvite from './ReferralInvite';

class ReferralReward extends Model {
  public id!: string;
  public user_id!: string;
  public invite_id!: string;
  public reward_type!: string;
  public quantity!: number;
  public direction!: string;
  public status!: string;
  public meta!: string;
  public readonly created_at!: Date;
}

ReferralReward.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    invite_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: ReferralInvite,
        key: 'id',
      },
    },
    reward_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'synastry_credit',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    direction: {
      type: DataTypes.ENUM('inviter', 'invitee'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('issued', 'reversed'),
      allowNull: false,
      defaultValue: 'issued',
    },
    meta: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '{}',
    },
  },
  {
    sequelize,
    tableName: 'referral_rewards',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['user_id', 'created_at'] },
      { fields: ['invite_id'] },
    ],
  }
);

export default ReferralReward;
