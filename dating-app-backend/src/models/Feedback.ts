import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Feedback extends Model {
  public id!: string;
  public user_id!: string;
  public type!: string;
  public content!: string;
  public contact!: string;
  public meta!: string;
  public readonly created_at!: Date;
}

Feedback.init(
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
    type: {
      type: DataTypes.ENUM('suggestion', 'bug', 'complaint'),
      allowNull: false,
      defaultValue: 'suggestion',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contact: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    meta: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '{}',
    },
  },
  {
    sequelize,
    tableName: 'feedback',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

export default Feedback;

