import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class RecommendationHistory extends Model {
  public id!: string;
  public viewer_id!: string;
  public candidate_id!: string;
  public shown_count!: number;
  public last_action!: string;
  public readonly first_shown_at!: Date;
  public readonly last_shown_at!: Date;
}

RecommendationHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    viewer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    candidate_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    shown_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    last_action: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'shown',
    },
    first_shown_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    last_shown_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'recommendation_history',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['viewer_id', 'candidate_id'],
      },
      {
        fields: ['viewer_id', 'last_shown_at'],
      },
    ],
  }
);

export default RecommendationHistory;
