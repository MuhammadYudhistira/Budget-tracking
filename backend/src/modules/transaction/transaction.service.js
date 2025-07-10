const { Op, where } = require("sequelize");
const { Transaction, User, Category, Wallet } = require("../../../models");
const { includes, date } = require("zod/v4");
const NotFound = require("../../errors/NotFoundError");
const BadRequestError = require("../../errors/BadRequestError");

class TransactionService {
    async getAllByUser(userId, page = 1, limit = 10, search = "") {
        const offset = (page - 1) * limit;

        const whereClause = {
            user_id: userId,
        };

        if (search) {
            whereClause[Op.or] = [
                { note: { [Op.like]: `%${search}%` } },
                { desc: { [Op.like]: `%${search}%` } },
            ];
        }

        const { count, rows } = await Transaction.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    require: false,
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    require: false,
                },
            ],
            order: [["date", "DESC"]],
            limit,
            offset,
            distinct: true,
        });

        return {
            data: rows,
            pagination: {
                total: count,
                page,
                limit,
                totalPages: Math.ceil(count / limit),
            },
        };
    }

    async getById(id) {
        const transaction = await Transaction.findByPk(id, {
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    require: false,
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    require: false,
                },
                {
                    model: Wallet,
                    attributes: ["id", "name", "balance"],
                    as: "wallet",
                    require: false,
                },
            ],
        });

        if (!transaction) throw new NotFound("Transaction not found");
        return transaction;
    }

    async create(data) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const transactions = await Transaction.findAll({
            where: {
                user_id: data.user_id,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth],
                },
            },
        });

        let totalIncome = 0;
        let totalExpense = 0;

        for (const tx of transactions) {
            const amount = parseInt(tx.amount);
            if (tx.type === "income") totalIncome += amount;
            if (tx.type === "expense") totalExpense += amount;
        }

        const amountToAdd = parseInt(data.amount);

        if (
            data.type === "expense" &&
            totalIncome < totalExpense + amountToAdd
        ) {
            throw new BadRequestError("Income bulan ini tidak mencukupi");
        }

        const wallet = await Wallet.findByPk(data.wallet_id);
        if (!wallet) throw new NotFound("Wallet not found");

        if (data.type === "income") {
            wallet.balance = parseInt(wallet.balance) + amountToAdd;
        } else {
            wallet.balance = parseInt(wallet.balance) - amountToAdd;
        }
        await wallet.save();

        return await Transaction.create(data);
    }

    async update(id, data) {
        const transaction = await Transaction.findByPk(id);
        if (!transaction) throw new NotFound("Transaction not found");

        const wallet = await Wallet.findByPk(transaction.wallet_id);
        if (!wallet) throw new NotFound("Wallet not found");

        // Konversi agar tidak terjadi string concat
        const oldAmount = parseInt(transaction.amount);
        const newAmount = parseInt(data.amount);
        wallet.balance = parseInt(wallet.balance);

        // Kembalikan saldo dari transaksi lama
        if (transaction.type === "income") {
            wallet.balance -= oldAmount;
        } else {
            wallet.balance += oldAmount;
        }

        // Tambahkan pengaruh transaksi baru
        if (data.type === "income") {
            wallet.balance += newAmount;
        } else {
            wallet.balance -= newAmount;
        }

        await wallet.save();

        // Validasi income bulan ini (opsional)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const transactions = await Transaction.findAll({
            where: {
                user_id: transaction.user_id,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth],
                },
            },
        });

        let totalIncome = 0;
        let totalExpense = 0;

        for (const tx of transactions) {
            if (tx.id === transaction.id) continue; // skip transaksi yang sedang diupdate
            const amount = parseInt(tx.amount);
            if (tx.type === "income") totalIncome += amount;
            if (tx.type === "expense") totalExpense += amount;
        }

        if (data.type === "expense") {
            totalExpense += newAmount;
            if (totalIncome < totalExpense) {
                throw new BadRequestError("Income bulan ini tidak mencukupi");
            }
        }

        await Transaction.update(data, { where: { id } });
        return true;
    }

    async delete(id) {
        const transaction = await Transaction.findByPk(id);
        if (!transaction) throw new NotFound("Transaction not found");

        const wallet = await Wallet.findByPk(transaction.wallet_id);
        if (!wallet) throw new NotFound("Wallet not found");

        const amount = parseInt(transaction.amount);
        wallet.balance = parseInt(wallet.balance);

        if (transaction.type === "income") {
            wallet.balance -= amount;
        } else {
            wallet.balance += amount;
        }

        await wallet.save();
        await transaction.destroy();

        return true;
    }

    async getMonthlySummary(userId) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth],
                },
            },
        });

        let totalIncome = 0;
        let totalExpense = 0;

        for (const tx of transactions) {
            const amount = parseInt(tx.amount);
            if (tx.type === "income") totalIncome += amount;
            if (tx.type === "expense") totalExpense += amount;
        }

        const balance = totalIncome - totalExpense;
        const saving = Math.floor(
            Math.max(0, totalIncome - totalExpense) * 0.3 + totalIncome * 0.05
        );

        return {
            income: totalIncome,
            expense: totalExpense,
            balance,
            saving,
        };
    }

    async getMonthlyChart(userId) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth],
                },
            },
        });

        const daysInMonth = endOfMonth.getDate();
        const chartData = [];

        for (let day = 1; day <= daysInMonth; day++) {
            chartData.push({
                date: `${now.getFullYear()}-${String(
                    now.getMonth() + 1
                ).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
                income: 0,
                expense: 0,
            });
        }

        for (const tx of transactions) {
            const date = new Date(tx.date);
            const day = date.getDate();
            const amount = parseInt(tx.amount);

            if (chartData[day - 1]) {
                if (tx.type === "income") chartData[day - 1].income += amount;
                if (tx.type === "expense") chartData[day - 1].expense += amount;
            }
        }

        return chartData;
    }

    async getTodayTransactions(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [today, endOfDay],
                },
            },
            order: [["date", "DESC"]],
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    require: false,
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    require: false,
                },
            ],
        });

        return transactions;
    }

    async getTodayExpenseStats(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [today, endOfDay],
                },
            },
            order: [["date", "DESC"]],
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    require: false,
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    require: false,
                },
            ],
        });

        return transactions;
    }

    async getTodayExpenseStats(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                type: "expense",
                date: {
                    [Op.between]: [today, endOfDay],
                },
            },
            order: [["date", "DESC"]],
        });

        const totalExpense = transactions.reduce(
            (sum, tx) => sum + parseInt(tx.amount),
            0
        );

        return {
            totalExpense,
            count: transactions.length,
        };
    }
}

module.exports = new TransactionService();
