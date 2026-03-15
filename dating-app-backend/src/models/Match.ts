import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Match extends Model {
  public id!: string;
  public user1_id!: string;
  public user2_id!: string;
  public female_id!: string | null;
  public male_id!: string | null;
  public female_question!: string | null;
  public male_answer!: string | null;
  public question_created_at!: Date | null;
  public answer_created_at!: Date | null;
  public chat_started_at!: Date | null;
  public chat_start_message_sent!: boolean;
  public stage!: string;
  public compatibility_score!: number;
  public status!: string;
  public readonly created_at!: Date;
}

Match.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user1_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    user2_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    female_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    male_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    female_question: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    male_answer: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    question_created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    answer_created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    chat_started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    chat_start_message_sent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    stage: {
      type: DataTypes.ENUM('matched', 'question_sent', 'answered', 'chat_started'),
      allowNull: false,
      defaultValue: 'matched',
    },
    compatibility_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 100,
      },
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'blocked'),
      defaultValue: 'active',
    },
  },
  {
    sequelize,
    tableName: 'matches',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['user1_id', 'user2_id'],
      },
    ],
  }
);

export default Match;
