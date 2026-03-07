import sequelize from '../config/database';
import { User, BaziInfo, Photo, Like, Post } from '../models';
import bcrypt from 'bcrypt';
import { calculateBazi } from '../services/baziService';

const seed = async () => {
  try {
    await sequelize.authenticate();
    // Force true to recreate tables including new Like/Post
    await sequelize.sync({ force: true }); 

    console.log('Database connected and cleared.');

    const passwordHash = await bcrypt.hash('password123', 10);

    const users = [
      { 
          username: 'Alice', email: 'alice@example.com', gender: 'female', birth_date: '1995-05-20',
          mbti: 'ENFP', interests: '["摄影", "旅行", "看展"]', love_view: '希望找个灵魂伴侣，一起探索世界',
          job: '设计师', height: 165, education: '本科', constellation: '金牛座', intro: '热爱生活，喜欢记录每一个美好瞬间。',
          school: '艺术学院', company: '创意工作室', hometown: '上海'
      },
      { 
          username: 'Bob', email: 'bob@example.com', gender: 'male', birth_date: '1992-08-15',
          mbti: 'INTJ', interests: '["编程", "阅读", "健身"]', love_view: '平平淡淡才是真，找个懂我的人',
          job: '程序员', height: 180, education: '硕士', constellation: '狮子座', intro: '虽然话不多，但是很靠谱。',
          school: '理工大学', company: '科技独角兽', hometown: '北京'
      },
      { 
          username: 'Cathy', email: 'cathy@example.com', gender: 'female', birth_date: '1998-11-03',
          mbti: 'ESFJ', interests: '["美食", "电影", "K歌"]', love_view: '期待一场轰轰烈烈的恋爱',
          job: '教师', height: 160, education: '本科', constellation: '天蝎座', intro: '性格开朗，喜欢结交新朋友。',
          school: '师范大学', company: '实验中学', hometown: '成都'
      },
      { 
          username: 'David', email: 'david@example.com', gender: 'male', birth_date: '1990-02-28',
          mbti: 'ENTP', interests: '["创业", "科技", "游戏"]', love_view: '势均力敌的爱情最长久',
          job: '产品经理', height: 178, education: '博士', constellation: '双鱼座', intro: '充满好奇心，喜欢挑战新鲜事物。',
          school: '商学院', company: '互联网大厂', hometown: '深圳'
      },
      { 
          username: 'Eva', email: 'eva@example.com', gender: 'female', birth_date: '1996-07-12',
          mbti: 'INFJ', interests: '["写作", "心理学", "瑜伽"]', love_view: '愿得一人心，白首不相离',
          job: '编辑', height: 168, education: '硕士', constellation: '巨蟹座', intro: '内心丰富，善于倾听。',
          school: '文学院', company: '出版社', hometown: '杭州'
      },
      { 
          username: 'Frank', email: 'frank@example.com', gender: 'male', birth_date: '1993-04-05',
          mbti: 'ISTP', interests: '["赛车", "滑雪", "DIY"]', love_view: '合得来最重要',
          job: '工程师', height: 182, education: '本科', constellation: '白羊座', intro: '动手能力强，喜欢户外运动。',
          school: '工业大学', company: '汽车集团', hometown: '沈阳'
      },
      { 
          username: 'Grace', email: 'grace@example.com', gender: 'female', birth_date: '1994-09-30',
          mbti: 'ENFJ', interests: '["公益", "演讲", "绘画"]', love_view: '互相成就，共同进步',
          job: 'HR', height: 163, education: '本科', constellation: '天秤座', intro: '热心肠，喜欢帮助别人。',
          school: '政法大学', company: '外企', hometown: '广州'
      },
      { 
          username: 'Henry', email: 'henry@example.com', gender: 'male', birth_date: '1991-12-18',
          mbti: 'ISFP', interests: '["音乐", "吉他", "猫"]', love_view: '简单快乐就好',
          job: '音乐人', height: 175, education: '大专', constellation: '射手座', intro: '自由随性，享受当下。',
          school: '音乐学院', company: '独立音乐人', hometown: '西安'
      },
    ];

    const createdUsers = [];

    for (const u of users) {
      const user = await User.create({
        username: u.username,
        email: u.email,
        password_hash: passwordHash,
        gender: u.gender,
        birth_date: new Date(u.birth_date),
        is_active: true,
        // Add new fields
        mbti: u.mbti,
        interests: u.interests,
        love_view: u.love_view,
        job: u.job,
        height: u.height,
        education: u.education,
        constellation: u.constellation,
        intro: u.intro,
        school: u.school,
        company: u.company,
        hometown: u.hometown
      });
      createdUsers.push(user);

      console.log(`Created user: ${user.username}`);

      // Calculate Bazi
      await calculateBazi(user.id, user.birth_date, user.gender);

      // Add dummy photo
      const genderId = u.gender === 'male' ? 'men' : 'women';
      const randomId = Math.floor(Math.random() * 50);
      await Photo.create({
          user_id: user.id,
          url: `https://randomuser.me/api/portraits/${genderId}/${randomId}.jpg`,
          is_primary: true
      });
      
      // Create some dummy posts
      await Post.create({
          user_id: user.id,
          content: `大家好，我是${user.username}，很高兴来到这里！今天天气真好。`,
          images: '[]'
      });
    }

    // Create some likes
    if (createdUsers.length > 1) {
        await Like.create({ user_id: createdUsers[0].id, target_id: createdUsers[1].id }); // Alice likes Bob
        await Like.create({ user_id: createdUsers[1].id, target_id: createdUsers[0].id }); // Bob likes Alice
    }

    // 创建管理员账号
    const adminPasswordHash = await bcrypt.hash('admin123456', 10);
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@banhe.com',
      password_hash: adminPasswordHash,
      gender: 'male',
      birth_date: new Date('1985-01-01'),
      is_active: true,
      is_verified: true,
      role: 'admin',
      mbti: 'INTJ',
      interests: '["管理", "命理", "旅游"]',
      love_view: '帮助用户找到真爱',
      job: '系统管理员',
      height: 175,
      education: '硕士',
      constellation: '摩羯座',
      intro: '我是系统管理员，负责平台运营。',
      school: '管理学院',
      company: '伴合科技',
      hometown: '香港'
    });
    console.log(`Created admin user: ${adminUser.username} (email: admin@banhe.com, password: admin123456)`);

    console.log('Seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seed();
