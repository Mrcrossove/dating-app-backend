import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Report extends Model {
  public id!: string;
  public user_id!: string;
  public target_id!: string | null;
  public target_type!: string;
  public reason!: string;
  public detail!: string;
  public status!: string;
  public review_note!: string | null;
  public action_taken!: string | null;
  public reviewed_by!: string | null;
  public reviewed_at!: Date | null;
  public readonly created_at!: Date;
}

Report.init(
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
    target_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    target_type: {
      type: DataTypes.ENUM('user', 'post', 'comment'),
      allowNull: false,
      defaultValue: 'user',
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    detail: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    review_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    action_taken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reviewed_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'user_reports',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

export default Report;
