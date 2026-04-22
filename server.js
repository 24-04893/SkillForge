const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ✅ LOAD ENV FIRST
dotenv.config();

// ✅ IMPORT MODELS
const User = require('./models/User');
const Challenge = require('./models/Challenge');
const Submission = require('./models/Submission');
const Competition = require('./models/Competition');

// ✅ INITIALIZE EXPRESS
const app = express();

// ✅ MIDDLEWARE
app.use(cors());
app.use(express.json());

// ✅ MONGODB CONNECTION
const connectDB = async () => {
  try {
    let uri = process.env.MONGODB_URI;

    // Check if URI is missing or still the placeholder
    if (!uri || uri.includes('<username>')) {
      console.log('🔄 No valid MONGODB_URI found. Starting In-Memory MongoDB...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      uri = mongoServer.getUri();
    }

    await mongoose.connect(uri);
    console.log('✅ MongoDB connected to:', uri.includes('127.0.0.1') ? 'In-Memory Server' : 'Cloud Database');

    // Seed test accounts
    const adminExists = await User.findOne({ email: 'admin@example.com' });
    if (!adminExists) {
      await User.create({ email: 'admin@example.com', password: 'admin123', fullName: 'Admin User', isAdmin: true });
    }
    const studentExists = await User.findOne({ email: 'student@example.com' });
    if (!studentExists) {
      await User.create({ email: 'student@example.com', password: 'student123', fullName: 'Student User', isAdmin: false });
    }

    // Seed Competitions (Always reseed for demo purposes)
    await Competition.deleteMany({});
    await Competition.insertMany([
      {
        title: "DiskuSSCion (Debate)",
        description: "A high-stakes parliamentary debate competition tackling campus policies and national issues.",
        organization: "Supreme Student Council Alangilan",
        date: new Date("2026-05-15"),
        tags: ["Debate", "Public Speaking", "Critical Thinking"],
        requiredSkills: { analytical: 70, creativity: 85, problemSolving: 50, persistence: 60, speed: 0 },
        demoMatchReason: "Matches your 85% Communication and 70% Analytical skill scores."
      },
      {
        title: "CIRCUIT",
        description: "A comprehensive seminar series covering modern programming, robotic automation, and technical startup pitching.",
        organization: "Computer Engineering Students Organization (CURSOR)",
        date: new Date("2026-05-10"),
        tags: ["Coding", "Robotics", "Pitching"],
        requiredSkills: { problemSolving: 90, analytical: 80, creativity: 60, persistence: 70, speed: 50 },
        demoMatchReason: "Matches your 90% Web Dev profile and your growing interest in Embedded Systems."
      },
      {
        title: "Technofusion 2026",
        description: "A collaborative tech summit where students pitch innovative software solutions to industry experts.",
        organization: "CICS Alangilan",
        date: new Date("2026-05-28"),
        tags: ["Innovation", "IT", "Pitching"],
        requiredSkills: { problemSolving: 90, creativity: 85, analytical: 70, persistence: 80, speed: 60 },
        demoMatchReason: "Highly recommended due to your 90% Web Dev proficiency and project history."
      },
      {
        title: "World Engineering Day",
        description: "A campus-wide celebration featuring design exhibits and seminars on the future of green engineering.",
        organization: "College of Engineering Student Council",
        date: new Date("2026-03-04"),
        tags: ["Engineering", "Seminar", "Sustainability"],
        requiredSkills: { analytical: 70, creativity: 70, problemSolving: 70, persistence: 60, speed: 30 },
        demoMatchReason: "Aligns with your interest in Sustainability Initiatives and Community Engagement."
      }
    ]);
    console.log('✅ Seeded new custom competitions');
  } catch (err) {
    console.error('❌ MongoDB Error:', err);
  }
};

connectDB();

// ✅ GEMINI AI SETUP
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════════
// 🥇 BADGE SYSTEM
// ═══════════════════════════════════════════════════════════════

function checkBadgesForStudent(skills) {
  const badges = [];

  if (skills.analytical >= 50 && skills.analytical < 75) {
    badges.push({ id: 'bronze-analyst', name: '🥉 Bronze Analyst', description: 'Reached 50% Analytical' });
  }
  if (skills.analytical >= 75 && skills.analytical < 100) {
    badges.push({ id: 'silver-analyst', name: '🥈 Silver Analyst', description: 'Reached 75% Analytical' });
  }
  if (skills.analytical >= 100) {
    badges.push({ id: 'gold-analyst', name: '🥇 Master Analyst', description: 'Mastered Analytical!' });
  }
  if (skills.speed >= 100) {
    badges.push({ id: 'speed-demon', name: '⚡ Speed Demon', description: 'Master of speed!' });
  }
  if (skills.problemSolving >= 100) {
    badges.push({ id: 'problem-master', name: '💡 Problem Master', description: 'Conquered all problems!' });
  }
  if (skills.creativity >= 50) {
    badges.push({ id: 'creative-mind', name: '🎨 Creative Mind', description: 'Unleashed creativity!' });
  }
  if (skills.persistence >= 100) {
    badges.push({ id: 'persistence-master', name: '🔥 Persistence Master', description: 'Never gave up!' });
  }

  const allSkills50 = Object.values(skills).every(s => s >= 50);
  if (allSkills50) {
    badges.push({ id: 'renaissance', name: '👑 Renaissance Person', description: 'Master of all skills!' });
  }

  return badges;
}

// ═══════════════════════════════════════════════════════════════
// AI EVALUATOR FUNCTION 1: Score & Skill Assessment
// ═══════════════════════════════════════════════════════════════

async function evaluateWithAI(studentSolution, challenge) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const evaluationPrompt = `You are an expert evaluator for student solutions.
Evaluate the student's answer based on the challenge.

Challenge Description:
${challenge.description}

Expected Solution / Approach:
${challenge.expectedSolution || 'Not specified - evaluate based on best practices'}

Student Submission:
${studentSolution}

---
Return your response STRICTLY in this JSON format:
{
  "score": number (0-100),
  "feedback": "clear and concise feedback",
  "skills": {
    "analytical": number (0-15),
    "creativity": number (0-10),
    "problemSolving": number (0-15),
    "persistence": number (0-10),
    "speed": number (0-10)
  }
}

---
Guidelines:
- Score based on correctness, clarity, and completeness
- Analytical: logic and structure (0-15)
- Creativity: uniqueness or approach (0-10)
- ProblemSolving: ability to solve the problem effectively (0-15)
- Persistence: effort shown (0-10)
- Speed: simplicity and efficiency of solution (0-10)
- Keep feedback short but insightful
- Return ONLY valid JSON, no additional text`;

    const result = await model.generateContent(evaluationPrompt);
    const response = result.response;
    let text = response.text();

    // Clean up response
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const evaluation = JSON.parse(text);

    console.log(`[AI] Evaluated submission - Score: ${evaluation.score}`);

    return {
      success: true,
      ...evaluation
    };
  } catch (error) {
    console.error('AI Evaluation Error:', error.message);
    // Only award points for skills the admin tagged on this challenge
    const targeted = challenge.targetSkills || [];
    const fallbackSkills = {
      analytical: targeted.includes('analytical') ? 5 : 0,
      creativity: targeted.includes('creativity') ? 5 : 0,
      problemSolving: targeted.includes('problemSolving') ? 5 : 0,
      persistence: targeted.includes('persistence') ? 5 : 0,
      speed: targeted.includes('speed') ? 5 : 0
    };
    return {
      success: true,
      score: 50,
      feedback: 'Automatic scoring applied (AI evaluation disabled or failed).',
      skills: fallbackSkills
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🤖 AI EVALUATOR FUNCTION 2: Skill Explanation
// ═══════════════════════════════════════════════════════════════

async function generateSkillExplanation(studentSolution, challenge, evaluation) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const explanationPrompt = `You are an AI learning assistant.
Explain why the student's skills improved based on their performance.

Challenge:
${challenge.description}

Student Solution:
${studentSolution}

Evaluation Result:
Score: ${evaluation.score}
Feedback: ${evaluation.feedback}
Skill Changes:
${JSON.stringify(evaluation.skills)}

---
Return a short explanation in this JSON format:
{
  "explanation": [
    "reason 1",
    "reason 2",
    "reason 3"
  ]
}

---
Guidelines:
- Explain WHY each skill improved
- Keep each explanation short and clear
- Make it educational and motivating
- Focus on what they did well
- Return ONLY valid JSON, no additional text`;

    const result = await model.generateContent(explanationPrompt);
    const response = result.response;
    let text = response.text();

    // Clean up response
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const explanationData = JSON.parse(text);

    return {
      success: true,
      explanation: explanationData.explanation || []
    };
  } catch (error) {
    console.error('AI Explanation Error:', error.message);
    return {
      success: false,
      explanation: [
        'Great effort on this solution!',
        'You demonstrated understanding of key concepts',
        'Keep practicing to improve further'
      ]
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔐 AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const newUser = new User({
      email,
      password,
      fullName,
      isAdmin: false
    });

    await newUser.save();

    res.json({
      message: 'User registered successfully',
      user: {
        id: newUser._id,
        email: newUser.email,
        fullName: newUser.fullName,
        isAdmin: newUser.isAdmin
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.password !== password) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📚 CHALLENGE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.get('/api/challenges', async (req, res) => {
  try {
    const challenges = await Challenge.find().populate('createdBy', 'fullName');
    res.json(challenges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/challenges/:id', async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id).populate('createdBy', 'fullName');

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    res.json(challenge);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📂 CATEGORIES ENDPOINT
// ═══════════════════════════════════════════════════════════════

app.get('/api/categories', (req, res) => {
  try {
    const categories = [
      { id: 'web-development', name: '🌐 Web Development' },
      { id: 'backend-development', name: '🔧 Backend Development' },
      { id: 'data-science', name: '📊 Data Science' },
      { id: 'mobile-development', name: '📱 Mobile Development' },
      { id: 'general', name: '⭐ General' }
    ];
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 👨‍💼 ADMIN: CREATE CHALLENGE
// ═══════════════════════════════════════════════════════════════

app.post('/api/admin/challenges', async (req, res) => {
  try {
    const { title, description, expectedSolution, difficulty, category, adminId, skills } = req.body;

    if (!title || !description || !difficulty) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const newChallenge = new Challenge({
      title,
      description,
      category: category || 'general',
      difficulty,
      expectedSolution: expectedSolution || '',
      targetSkills: skills || [],
      createdBy: adminId
    });

    await newChallenge.save();

    console.log(`[ADMIN] ${admin.fullName} created challenge: ${title}`);

    res.json({
      message: 'Challenge created successfully',
      challenge: newChallenge
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 👨‍💼 ADMIN: DELETE CHALLENGE
// ═══════════════════════════════════════════════════════════════

app.delete('/api/admin/challenges/:id', async (req, res) => {
  try {
    const { adminId } = req.body;

    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await Challenge.findByIdAndDelete(req.params.id);

    console.log(`[ADMIN] ${admin.fullName} deleted challenge`);

    res.json({ message: 'Challenge deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📤 STUDENT: SUBMIT SOLUTION
// ═══════════════════════════════════════════════════════════════

app.post('/api/submissions', async (req, res) => {
  try {
    const { userId, challengeId, solution } = req.body;

    if (!userId || !challengeId || !solution) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.findById(userId);
    const challenge = await Challenge.findById(challengeId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const submission = new Submission({
      userId,
      challengeId,
      solution,
      status: 'pending'
    });

    await submission.save();

    console.log(`[SUBMISSION] ${user.fullName} submitted solution for challenge ${challenge.title}`);

    res.json({
      message: '✅ Solution submitted! Waiting for admin review.',
      submission
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📋 GET USER'S SUBMISSIONS
// ═══════════════════════════════════════════════════════════════

app.get('/api/submissions/:userId', async (req, res) => {
  try {
    const userSubs = await Submission.find({ userId: req.params.userId })
      .populate('challengeId', 'title');

    const detailed = userSubs.map(sub => ({
      ...sub.toObject(),
      challengeTitle: sub.challengeId?.title
    }));

    res.json(detailed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 👨‍💼 ADMIN: VIEW PENDING SUBMISSIONS
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/submissions', async (req, res) => {
  try {
    const { adminId, status } = req.query;

    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const filterStatus = status || 'pending';
    const filtered = await Submission.find({ status: filterStatus })
      .populate('userId', 'fullName email')
      .populate('challengeId', 'title description expectedSolution');

    const detailed = filtered.map(sub => ({
      ...sub.toObject(),
      challengeTitle: sub.challengeId?.title,
      challengeDescription: sub.challengeId?.description,
      challengeExpectedSolution: sub.challengeId?.expectedSolution,
      studentName: sub.userId?.fullName,
      studentEmail: sub.userId?.email
    }));

    res.json(detailed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 👨‍💼 ADMIN: GRADE SUBMISSION (WITH AI EVALUATOR) ⭐ KEY ENDPOINT
// ═══════════════════════════════════════════════════════════════

app.post('/api/admin/submissions/:id/grade', async (req, res) => {
  try {
    const { adminId, score, feedback, approve, useAI } = req.body;

    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const submission = await Submission.findById(req.params.id)
      .populate('userId')
      .populate('challengeId');

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    submission.status = approve ? 'approved' : 'rejected';
    submission.approvedAt = approve ? new Date() : null;

    // ✅ AI EVALUATION LOGIC
    let aiEvaluation = null;
    let skillExplanation = null;

    if (useAI && approve) {
      const challenge = submission.challengeId;
      const student = submission.userId;

      console.log(`[AI] Starting evaluation for ${student.fullName}...`);

      // Get AI evaluation
      aiEvaluation = await evaluateWithAI(submission.solution, challenge);

      if (aiEvaluation.success) {
        // Use AI score and feedback
        submission.score = aiEvaluation.score;
        submission.adminFeedback = aiEvaluation.feedback;
        submission.aiEvaluation = aiEvaluation;

        // Get explanation for why skills improved
        skillExplanation = await generateSkillExplanation(
          submission.solution,
          challenge,
          aiEvaluation
        );

        submission.skillExplanation = skillExplanation;

        // Update student skills with AI evaluation
        if (student && aiEvaluation.skills) {
          student.skills.analytical = Math.min(
            student.skills.analytical + aiEvaluation.skills.analytical,
            100
          );
          student.skills.creativity = Math.min(
            student.skills.creativity + aiEvaluation.skills.creativity,
            100
          );
          student.skills.problemSolving = Math.min(
            student.skills.problemSolving + aiEvaluation.skills.problemSolving,
            100
          );
          student.skills.persistence = Math.min(
            student.skills.persistence + aiEvaluation.skills.persistence,
            100
          );
          student.skills.speed = Math.min(
            student.skills.speed + aiEvaluation.skills.speed,
            100
          );

          await student.save();

          console.log(`[AI EVAL] ${student.fullName} - Score: ${aiEvaluation.score}, Skills Updated ✅`);
        }
      }
    } else if (approve) {
      // Manual scoring if no AI
      submission.score = parseInt(score) || 0;
      submission.adminFeedback = feedback;

      const student = submission.userId;
      if (student) {
        const skillBoost = Math.round(parseInt(score) / 10);
        student.skills.problemSolving = Math.min(
          student.skills.problemSolving + skillBoost,
          100
        );
        student.skills.creativity = Math.min(
          student.skills.creativity + Math.round(skillBoost / 2),
          100
        );

        await student.save();
      }
    }

    await submission.save();

    // Get badges
    let newBadges = [];
    if (approve) {
      const student = submission.userId;
      if (student) {
        newBadges = checkBadgesForStudent(student.skills);
      }
    }

    res.json({
      message: approve ? '✅ Submission approved!' : '❌ Submission rejected',
      submission,
      newBadges,
      newBadgesMessage: newBadges.length > 0
        ? `🎉 Unlocked: ${newBadges.map(b => b.name).join(', ')}`
        : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 👤 USER ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      skills: user.skills
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/:id/full-profile', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userSubs = await Submission.find({ userId: req.params.id });
    const approved = userSubs.filter(s => s.status === 'approved').length;
    const rejected = userSubs.filter(s => s.status === 'rejected').length;
    const pending = userSubs.filter(s => s.status === 'pending').length;
    const avgScore = approved > 0
      ? Math.round(userSubs.filter(s => s.status === 'approved').reduce((sum, s) => sum + (s.score || 0), 0) / approved)
      : 0;

    res.json({
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt,
      skills: user.skills,
      submissions: { approved, rejected, pending, total: userSubs.length },
      avgScore,
      recentSubmissions: userSubs.slice(-5).reverse()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/:id/stats', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userSubs = await Submission.find({ userId: req.params.id });
    const approved = userSubs.filter(s => s.status === 'approved').length;
    const rejected = userSubs.filter(s => s.status === 'rejected').length;
    const pending = userSubs.filter(s => s.status === 'pending').length;

    res.json({
      totalSubmissions: userSubs.length,
      approvedCount: approved,
      rejectedCount: rejected,
      pendingCount: pending,
      allSkills: user.skills
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🏆 LEADERBOARD
// ═══════════════════════════════════════════════════════════════

app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false });

    const leaderboard = await Promise.all(
      users.map(async (user) => {
        const userSubs = await Submission.find({ userId: user._id, status: 'approved' });

        return {
          id: user._id,
          fullName: user.fullName,
          submissionsApproved: userSubs.length,
          averageScore: userSubs.length > 0
            ? Math.round(userSubs.reduce((sum, s) => sum + (s.score || 0), 0) / userSubs.length)
            : 0,
          averageSkill: Math.round(
            Object.values(user.skills).reduce((a, b) => a + b, 0) / 5
          ),
          skills: user.skills
        };
      })
    );

    const sorted = leaderboard
      .sort((a, b) => b.averageSkill - a.averageSkill)
      .slice(0, 20);

    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🧪 TEST ENDPOINT
// ═══════════════════════════════════════════════════════════════

app.get('/api/test', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const challengeCount = await Challenge.countDocuments();
    const submissionCount = await Submission.countDocuments();

    res.json({
      message: '✅ Backend is working!',
      users: userCount,
      challenges: challengeCount,
      submissions: submissionCount,
      aiEnabled: !!process.env.GEMINI_API_KEY,
      mongodbConnected: mongoose.connection.readyState === 1,
      testAccounts: [
        { email: 'admin@example.com', password: 'admin123', role: 'admin' },
        { email: 'student@example.com', password: 'student123', role: 'student' }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🏆 COMPETITIONS / SMART MATCH
// ═══════════════════════════════════════════════════════════════

app.get('/api/competitions/match/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const competitions = await Competition.find();

    const matchedCompetitions = await Promise.all(competitions.map(async (comp) => {
      const compObj = comp.toObject();
      let matchSum = 0;
      let requiredCount = 0;
      let skillGaps = [];

      // Calculate match percentage and skill gaps
      const skills = ['analytical', 'persistence', 'speed', 'creativity', 'problemSolving'];
      skills.forEach(skill => {
        const required = compObj.requiredSkills[skill];
        if (required > 0) {
          requiredCount++;
          const userLevel = user.skills[skill] || 0;
          let matchForSkill = Math.min(100, (userLevel / required) * 100);
          matchSum += matchForSkill;

          if (userLevel < required) {
            skillGaps.push({ skill, required, current: userLevel });
          }
        }
      });

      const overallMatch = requiredCount > 0 ? Math.round(matchSum / requiredCount) : 100;
      compObj.matchPercentage = overallMatch;
      compObj.skillGaps = skillGaps;

      // Recommend challenges if there's a gap
      compObj.recommendedChallenges = [];
      if (overallMatch < 100) {
        // Find uncompleted challenges. For simplicity, just get 2 random challenges right now.
        // We could filter by targetSkills, but since we just added it, most won't have it.
        const completedSubs = await Submission.find({ userId: user._id, status: 'approved' });
        const completedIds = completedSubs.map(s => s.challengeId);

        const recommended = await Challenge.find({ _id: { $nin: completedIds } }).limit(2);
        compObj.recommendedChallenges = recommended;
      }

      return compObj;
    }));

    // Sort by match percentage descending
    matchedCompetitions.sort((a, b) => b.matchPercentage - a.matchPercentage);

    res.json(matchedCompetitions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3005;

app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
  console.log(` AI Evaluator: ${process.env.GEMINI_API_KEY ? 'Enabled' : 'Disabled'}`);
  console.log(` MongoDB: Connected`);
  console.log('');
  console.log(' TEST ACCOUNTS:');
  console.log('  Admin:   admin@example.com / admin123');
  console.log('  Student: student@example.com / student123');
  console.log('');
});

module.exports = app;