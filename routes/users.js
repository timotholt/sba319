import express from 'express';
import { validateUsername, validateNickname, validateUserId } from '../middleware/validation.js';
import { validation } from '../utils/validation.js';
import { UserDB } from '../models/User.js';
import { GameStateDB } from '../models/GameState.js';
import { ChatDB } from '../models/Chat.js';
import { APIError } from '../middleware/errorHandling.js';
import { SystemMessages } from '../models/SystemMessages.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

router.post('/register', async (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] POST /register - Parameters:`, { 
        username: req.body.username,
        nickname: req.body.nickname,
        passwordLength: req.body.password?.length || 0
    });

    try {
        const { username, password, nickname } = req.body;

        if (!username || !password) {
            throw new APIError('Username and password are required', 400);
        }

        // The consequence of using findOne over fineOneActive is that
        // new users can't reuse login names of deleted users. This is actually
        // a positive -- it eliminates the use of deleted users that were hacked,
        // phished, etc.
        const existingUser = await UserDB.findOne({ username });
        if (existingUser) {
            throw new APIError('Username already exists', 400);
        }

        await UserDB.create({ 
            username, 
            password,
            nickname: nickname || username 
        });
        console.log(`[${timestamp}] Registration successful for user: ${username}`);

        res.json({
            success: true,
            message: 'Registration successful'
        });
    } catch (error) {
        next(error);
    }
});

router.post('/login', validateUsername, async (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] POST /login - Parameters:`, {
        username: req.body.username,
        password: req.body.password,
        passwordLength: req.body.password?.length || 0
    });

    try {
        const { username, password } = req.body;

        // Use findOneActive to exclude deleted users
        const user = await UserDB.findOneActive({ username });
        if (!user || user.password !== password) {
            throw new APIError('Invalid username or password', 401);
        }

        // Send system message about user login
        await SystemMessages.userLoggedIn(user.nickname);

        console.log(`[${timestamp}] Login successful for user: ${username}`);
        res.json({ 
            success: true,
            nickname: user.nickname,
            userId: user.userId
        });
    } catch (error) {
        next(error);
    }
});

router.get('/admin-url', (req, res) => {
    res.json({ url: process.env.MONGO_ADMIN_URL });
});

router.post('/logout', validateUserId, async (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] POST /logout - Parameters:`, {
        userId : req.body.userId
    });

    try {
        const { userId } = req.body;
        
        // Get user before removing from games
        const user = await UserDB.findById(userId);
        if (!user) {
            throw new APIError('User not found', 404);
        }

        // Send system message about user logout
        await SystemMessages.userLoggedOut(user.nickname);

        const games = await GameStateDB.findAll();
        for (const game of games) {
            if (await GameStateDB.isPlayerInGame(game.id, userId)) {
                await GameStateDB.removePlayer(game.id, userId);
            }
        }
      
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

router.patch('/change-nickname', validateNickname, async (req, res, next) => {
    try {
        const { userId, nickname } = req.body;
      
        // Get user before updating nickname
        const user = await UserDB.findById(userId);
        if (!user) {
            throw new APIError('User not found', 404);
        }

        // Trim the nickname
        const trimmedNickname = validation.trim.nickname(nickname);
        
        if (!trimmedNickname) {
            throw new APIError('Nickname cannot be empty', 400);
        }

        // Update user's nickname
        await UserDB.update({ userId }, { nickname: trimmedNickname });

        // Update all chat messages from this user
        await ChatDB.update(
            { userId }, // Find all messages by this user
            { nickname: trimmedNickname } // Update their nickname
        );

        // Send system message about nickname change
        await SystemMessages.nicknameChanged(user.nickname, trimmedNickname);

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

router.patch('/change-password', validateUserId, async (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] PATCH /change-password - UserId: ${req.body.userId}`);

    try {
        const { userId, currentPassword, newPassword } = req.body;
        const user = await UserDB.findById(userId);

        if (!user || user.password !== currentPassword) {
            throw new APIError('Current password is incorrect', 401);
        }

        await UserDB.updateById(userId, { password: newPassword });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Delete is very complicated. We don't actually delete users from the
// database! That would be too easy.  We mark them as soft deleted
// so that any games they created, any chat messages they wrote, etc,
// will still show up in the games list, in chat windows, etc. Otherwise
// other players on the serveer will have a weird expeerience with 
// missing games they are still playing in, chat logs missing part of
// a conversation, etc.

router.delete('/:userId', validateUserId, async (req, res, next) => {
    const timestamp = new Date().toISOString();
    const userId = req.params.userId;
    console.log(`[${timestamp}] DELETE /${userId}`);

    try {
        const user = await UserDB.findById(userId);
        if (!user) {
            throw new APIError('User not found', 404);
        }

        // Check for active games
        const games = await GameStateDB.findAll();
        const activeGames = games.filter(game => 
            game.creator === userId && 
            game.players.length > 0 &&
            game.players.some(player => player !== userId)
        );

        if (activeGames.length > 0) {
            throw new APIError(
                'Cannot delete account while you have active games with other players. Please delete your games first.',
                400
            );
        }

        // Send system message before deleting
        await SystemMessages.userDeleted(user.nickname);

        // Soft delete the user
        await UserDB.softDelete(userId);

        // Remove from active games
        for (const game of games) {
            if (await GameStateDB.isPlayerInGame(game.id, userId)) {
                await GameStateDB.removePlayer(game.id, userId);
            }
        }

        // Update all chat messages from this user as 'user deleted'
        await ChatDB.markUserDeleted(userId);

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export { router };