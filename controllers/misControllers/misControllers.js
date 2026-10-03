import fs from "fs/promises";
import path from "path";
import { Parser } from "json2csv";
import User from "../../models/authModels/User.js";
import UserLoginLogs from "../../models/authModels/UserLoginLog.js";
import Subject from "../../models/classModel/subjectModel.js";
import CourseSchemaRelation from "../../models/subjectSchemaRelationModel/subjectSchemaRelationModel.js";
import QuestionDefinition from "../../models/schemeModel/questionDefinitionSchema.js";

/*------------------------------------------------------------*/
/* Question Wise Model Imports                                */
/*------------------------------------------------------------*/
import Task from "../../models/taskModels/taskModel.js";
import AnswerPdf from "../../models/EvaluationModels/studentAnswerPdf.js";
import Marks from "../../models/EvaluationModels/marksModel.js";

/*------------------------------------------------------------*/
/* Booklet Wise Model Imports                                 */
/*------------------------------------------------------------*/
import BookletTask from "../../models/taskModels/bookletTaskModel.js";
import BookletAnswerPdf from "../../models/EvaluationModels/bookletAnswerPdfModel.js";
import BookletMarks from "../../models/EvaluationModels/bookletMarksModel.js";

/*------------------------------------------------------------*/
/* Provides All Users login logs and User details             */
/*------------------------------------------------------------*/
const getAllUserLoginLogs = async (req, res) => {
  try {
    const logs = await UserLoginLogs.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          sessionId: 1,
          loginAt: 1,
          logoutAt: 1,
          logoutReason: 1,
          status: 1,
          ip: 1,
          userAgent: 1,
          createdAt: 1,
          updatedAt: 1,

          "user._id": 1,
          "user.name": 1,
          "user.email": 1,
          "user.mobile": 1,
          "user.role": 1,
          "user.subjectCode": 1,
          "user.maxBooklets": 1,
          "user.limitType": 1,
        },
      },
      {
        $sort: {
          loginAt: -1,
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Error fetching login logs:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch login logs",
      error: error.message,
    });
  }
};

/*------------------------------------------------------------*/
/* Provides single user login logs and assignment details     */
/*------------------------------------------------------------*/
const getUserLoginAndAssignmentDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { assignmentType = "question" } = req.query;

    const user = await User.findById(userId).select(
      "name email mobile role subjectCode maxBooklets limitType",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const loginLogs = await UserLoginLogs.find({ userId })
      .sort({ loginAt: -1 })
      .lean();

    const activeSession = await UserLoginLogs.exists({
      userId,
      status: 1,
    });

    let assigned = 0;
    let completed = 0;

    if (assignmentType === "booklet") {
      assigned = await BookletTask.countDocuments({ userId });

      completed = await BookletTask.countDocuments({
        userId,
        status: "completed", // replace with actual completed status if differs
      });
    } else {
      assigned = await Task.countDocuments({ userId });

      completed = await Task.countDocuments({
        userId,
        status: "completed", // replace with actual completed status if differs
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
        assignmentType,
        statistics: {
          assigned,
          completed,
          remaining: assigned - completed,
        },
        loginStatistics: {
          totalLogins: loginLogs.length,
          activeSession: !!activeSession,
          lastLogin: loginLogs[0]?.loginAt || null,
        },
        loginLogs,
      },
    });
  } catch (error) {
    console.error("Error fetching user details:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user details",
      error: error.message,
    });
  }
};

/*------------------------------------------------------------*/
/* Calculates User Efficiency                                 */
/*------------------------------------------------------------*/
const getUserEfficiency = async (req, res) => {
  try {
    const { userId } = req.params;
    const { assignmentType = "booklet" } = req.query;

    console.log("Calculating efficiency for user:", userId, "Assignment Type:", assignmentType);

    const user = await User.findById(userId).select(
      "name email role maxBooklets limitType",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let totalAssigned = 0;
    let completed = 0;

    if (assignmentType === "question") {
      // Get all tasks assigned to the user
      const tasks = await Task.find({
        userId,
      }).select("_id");

      const taskIds = tasks.map((task) => task._id);

      // Total assigned answer pdfs
      totalAssigned = await AnswerPdf.countDocuments({
        taskId: { $in: taskIds },
      });

      // Completed answer pdfs
      completed = await AnswerPdf.countDocuments({
        taskId: { $in: taskIds },
        status: "true",
      });
    } else {
      // Get all booklet tasks assigned to the user
      const bookletTasks = await BookletTask.find({
        userId,
      }).select("_id");

      const taskIds = bookletTasks.map((task) => task._id);

      // Total assigned booklets
      totalAssigned = await BookletAnswerPdf.countDocuments({
        bookletTaskId: { $in: taskIds },
      });

      // Completed booklets
      completed = await BookletAnswerPdf.countDocuments({
        bookletTaskId: { $in: taskIds },
        status: "true",
      });
    }

    const remaining = totalAssigned - completed;

    const efficiency =
      totalAssigned > 0
        ? Number(((completed / totalAssigned) * 100).toFixed(2))
        : 0;

      console.log(`User: ${user.name}, Assignment Type: ${assignmentType}, Total Assigned: ${totalAssigned}, Completed: ${completed}, Remaining: ${remaining}, Efficiency: ${efficiency}%`);

    return res.status(200).json({
      success: true,
      data: {
        user,
        assignmentType,
        totalAssigned,
        completed,
        remaining,
        efficiency,
      },
    });
  } catch (error) {
    console.error("Error fetching efficiency:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user efficiency",
      error: error.message,
    });
  }
};

/*----------------------------------------------------------------------*/
/* Calculates Pass or Fail for a particular user evaluated booklets     */
/*----------------------------------------------------------------------*/
const getUserPassFailSummary = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "name email role subjectCode",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const subjects = await Subject.find({
      _id: { $in: user.subjectCode },
    });

    const subjectIds = subjects.map((s) => s._id);

    const relations = await CourseSchemaRelation.find({
      subjectId: { $in: subjectIds },
    }).populate("schemaId");

    const schemaMap = {};

    relations.forEach((relation) => {
      const subject = subjects.find(
        (s) => s._id.toString() === relation.subjectId.toString(),
      );

      if (!subject || !relation.schemaId) return;

      schemaMap[subject.code] = {
        minMarks: relation.schemaId.minMarks,
        schemaType: relation.schemaId.schemaType,
        schemaName: relation.schemaId.name,
      };
    });

    let totalPassed = 0;
    let totalFailed = 0;

    let bookletWisePassed = 0;
    let bookletWiseFailed = 0;

    let questionWisePassed = 0;
    let questionWiseFailed = 0;

    let totalBookletStudents = 0;
    let totalQuestionStudents = 0;

    /*
    ==========================================
    BOOKLET WISE
    ==========================================
    */

    const bookletTasks = await BookletTask.find({
      userId,
    });

    for (const task of bookletTasks) {
      const schemaInfo = schemaMap[task.subjectCode];

      if (!schemaInfo) continue;

      if (schemaInfo.schemaType !== "booklet_wise") continue;

      const answerPdfs = await BookletAnswerPdf.find({
        bookletTaskId: task._id,
      }).select("_id");

      totalBookletStudents += answerPdfs.length;

      const bookletIds = answerPdfs.map((pdf) => pdf._id);

      const totals = await BookletMarks.aggregate([
        {
          $match: {
            bookletAnswerPdfId: { $in: bookletIds },
          },
        },
        {
          $group: {
            _id: "$bookletAnswerPdfId",
            totalMarks: {
              $sum: "$allottedMarks",
            },
          },
        },
      ]);

      totals.forEach((booklet) => {
        if (booklet.totalMarks >= schemaInfo.minMarks) {
          bookletWisePassed++;
          totalPassed++;
        } else {
          bookletWiseFailed++;
          totalFailed++;
        }
      });
    }

    /*
    ==========================================
    QUESTION WISE
    ==========================================
    */

    const tasks = await Task.find({
      userId,
    });

    for (const task of tasks) {
      const schemaInfo = schemaMap[task.subjectCode];

      if (!schemaInfo) continue;

      if (schemaInfo.schemaType !== "question_wise") continue;

      const answerPdfs = await AnswerPdf.find({
        taskId: task._id,
      }).select("_id");

      totalQuestionStudents += answerPdfs.length;

      const answerPdfIds = answerPdfs.map((pdf) => pdf._id);

      const totals = await Marks.aggregate([
        {
          $match: {
            answerPdfId: { $in: answerPdfIds },
          },
        },
        {
          $group: {
            _id: "$answerPdfId",
            totalMarks: {
              $sum: "$allottedMarks",
            },
          },
        },
      ]);

      totals.forEach((answer) => {
        if (answer.totalMarks >= schemaInfo.minMarks) {
          questionWisePassed++;
          totalPassed++;
        } else {
          questionWiseFailed++;
          totalFailed++;
        }
      });
    }

    const checkedStudents = totalPassed + totalFailed;

    const totalStudents = totalBookletStudents + totalQuestionStudents;

    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        userName: user.name,
        role: user.role,

        totalStudents,
        checkedStudents,

        passedStudents: totalPassed,
        failedStudents: totalFailed,

        passPercentage:
          checkedStudents > 0
            ? Number(((totalPassed / checkedStudents) * 100).toFixed(2))
            : 0,

        failPercentage:
          checkedStudents > 0
            ? Number(((totalFailed / checkedStudents) * 100).toFixed(2))
            : 0,

        bookletWise: {
          totalStudents: totalBookletStudents,
          checkedStudents: bookletWisePassed + bookletWiseFailed,
          passed: bookletWisePassed,
          failed: bookletWiseFailed,
        },

        questionWise: {
          totalStudents: totalQuestionStudents,
          checkedStudents: questionWisePassed + questionWiseFailed,
          passed: questionWisePassed,
          failed: questionWiseFailed,
        },
      },
    });
  } catch (error) {
    console.error("Pass/Fail Summary Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pass/fail summary",
      error: error.message,
    });
  }
};

/*------------------------------------------------------------*/
/* Calculates User's Attandance                               */
/*------------------------------------------------------------*/
const getUserAttendance = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("name email role");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayLogs = await UserLoginLog.find({
      userId,
      loginAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .sort({ loginAt: 1 })
      .lean();

    const loggedInToday = todayLogs.length > 0;

    const loginCount = todayLogs.length;

    const firstLogin = todayLogs.length > 0 ? todayLogs[0].loginAt : null;

    const lastLogin =
      todayLogs.length > 0 ? todayLogs[todayLogs.length - 1].loginAt : null;

    const currentlyLoggedIn = await UserLoginLog.exists({
      userId,
      status: 1,
    });

    return res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },

        attendance: {
          date: startOfDay,
          loggedInToday,
          loginCount,
          firstLogin,
          lastLogin,
          currentlyLoggedIn: !!currentlyLoggedIn,
        },

        sessions: todayLogs.map((log) => ({
          sessionId: log.sessionId,
          loginAt: log.loginAt,
          logoutAt: log.logoutAt,
          logoutReason: log.logoutReason,
          status: log.status,
          ip: log.ip,
        })),
      },
    });
  } catch (error) {
    console.error("Attendance Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance",
      error: error.message,
    });
  }
};

/*------------------------------------------------------------*/
/* Sort Most & Least Attempted Questions                      */
/*------------------------------------------------------------*/
const getQuestionAttemptAnalysis = async (req, res) => {
  try {
    const analytics = [];

    const subjects = await Subject.find({
      isActive: true,
    }).lean();

    const annotationRoot = path.join(process.cwd(), "BookletAnnotations");

    let userFolders = [];

    try {
      userFolders = await fs.readdir(annotationRoot);
    } catch {
      userFolders = [];
    }

    for (const subject of subjects) {
      try {
        /*
        =====================================================
        STEP 1 : FIND SCHEMA
        =====================================================
        */

        const relation = await CourseSchemaRelation.findOne({
          subjectId: subject._id,
        }).lean();

        if (!relation) {
          analytics.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,
            totalBooklets: 0,
            mostAttempted: [],
            leastAttempted: [],
            allQuestions: [],
          });

          continue;
        }

        /*
        =====================================================
        STEP 2 : GET QUESTIONS
        =====================================================
        */

        const questions = await QuestionDefinition.find({
          schemaId: relation.schemaId,
        }).lean();

        const stats = {};

        questions.forEach((q) => {
          /*
          Skip parent/container questions
          Example:
          Q1
          Q2
          */

          const isParentQuestion =
            q.isSubQuestion === true && q.numberOfSubQuestions > 0;

          if (isParentQuestion) {
            return;
          }

          stats[q.questionsName] = {
            question: q.questionsName,
            attempted: 0,
            total: 0,
            percentage: 0,
          };
        });

        /*
        =====================================================
        STEP 3 : GET TASKS
        =====================================================
        */

        const tasks = await BookletTask.find({
          subjectCode: subject.code,
        })
          .select("_id")
          .lean();

        const taskIds = tasks.map((t) => t._id);

        if (!taskIds.length) {
          analytics.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,
            totalBooklets: 0,
            mostAttempted: [],
            leastAttempted: [],
            allQuestions: Object.keys(stats).map((q) => `Q${q}`),
          });

          continue;
        }

        /*
        =====================================================
        STEP 4 : GET EVALUATED BOOKLETS
        =====================================================
        */

        const booklets = await BookletAnswerPdf.find({
          bookletTaskId: {
            $in: taskIds,
          },
          status: "true",
        })
          .select("_id")
          .lean();

        let totalBooklets = 0;

        /*
        =====================================================
        STEP 5 : PROCESS BOOKLETS
        =====================================================
        */

        for (const booklet of booklets) {
          const bookletId = booklet._id.toString();

          let marksFile = null;
          let marksDataFile = null;

          /*
          Find:
          BookletAnnotations/userId/bookletId
          */

          for (const userId of userFolders) {
            const bookletFolder = path.join(annotationRoot, userId, bookletId);

            try {
              await fs.access(bookletFolder);

              marksFile = path.join(bookletFolder, "marks.json");

              marksDataFile = path.join(bookletFolder, "marksData.json");

              break;
            } catch {
              continue;
            }
          }

          if (!marksDataFile) {
            continue;
          }

          /*
          =====================================================
          STEP 6 : READ FILES
          =====================================================
          */

          let marks = [];
          let marksData = [];

          try {
            const marksContent = await fs.readFile(marksFile, "utf8");

            marks = JSON.parse(marksContent)?.marks || [];
          } catch {
            marks = [];
          }

          try {
            const marksDataContent = await fs.readFile(marksDataFile, "utf8");

            marksData = JSON.parse(marksDataContent)?.marks || [];
          } catch {
            continue;
          }

          /*
          =====================================================
          STEP 7 : CREATE LOOKUP
          =====================================================
          */

          const marksMap = {};

          marks.forEach((m) => {
            marksMap[m.question] = m;
          });

          totalBooklets++;

          /*
          =====================================================
          STEP 8 : CALCULATE ATTEMPTS
          =====================================================
          */

          for (const question of marksData) {
            /*
            Skip parent questions
            */

            const isParentQuestion =
              question.isSubQuestion === true &&
              question.numberOfSubQuestions > 0;

            if (isParentQuestion) {
              continue;
            }

            const questionName = question.questionsName;

            if (!stats[questionName]) {
              continue;
            }

            stats[questionName].total++;

            const mark = marksMap[questionName];

            let attempted = false;

            /*
            ATTEMPT RULE

            Marks > 0
            OR
            Page Exists
            */

            if (mark) {
              const allotted = Number(mark.allottedMarks || 0);

              const hasPage =
                mark.page !== undefined &&
                mark.page !== null &&
                mark.page !== "";

              attempted = allotted > 0 || hasPage;
            }

            if (attempted) {
              stats[questionName].attempted++;
            }
          }
        }

        /*
        =====================================================
        STEP 9 : CALCULATE %
        =====================================================
        */

        const allQuestionsData = Object.values(stats).map((q) => {
          q.percentage =
            q.total === 0
              ? 0
              : Number(((q.attempted / q.total) * 100).toFixed(2));

          return q;
        });

        /*
        =====================================================
        STEP 10 : SORT
        =====================================================
        */

        const sortedQuestions = [...allQuestionsData].sort((a, b) => {
          if (b.percentage !== a.percentage) {
            return b.percentage - a.percentage;
          }

          return b.attempted - a.attempted;
        });

        /*
        =====================================================
        MOST ATTEMPTED
        =====================================================
        */

        const highestPercentage = sortedQuestions.length
          ? sortedQuestions[0].percentage
          : 0;

        const mostAttempted = sortedQuestions
          .filter((q) => q.percentage === highestPercentage)
          .map((q) => `Q${q.question}`);

        /*
        =====================================================
        LEAST ATTEMPTED
        =====================================================
        */

        const lowestPercentage = sortedQuestions.length
          ? sortedQuestions[sortedQuestions.length - 1].percentage
          : 0;

        const leastAttempted = sortedQuestions
          .filter((q) => q.percentage === lowestPercentage)
          .map((q) => `Q${q.question}`);

        /*
        =====================================================
        ALL QUESTIONS
        =====================================================
        */

        const allQuestions = [...allQuestionsData]
          .sort((a, b) =>
            a.question.localeCompare(b.question, undefined, {
              numeric: true,
            }),
          )
          .map((q) => `Q${q.question}`);

        analytics.push({
          subjectId: subject._id,
          subjectName: subject.name,
          subjectCode: subject.code,
          totalBooklets,
          mostAttempted,
          leastAttempted,
          allQuestions,
        });
      } catch (err) {
        console.error(`Analytics failed for subject ${subject.name}`, err);
      }
    }

    return res.status(200).json({
      success: true,
      count: analytics.length,
      data: analytics,
    });
  } catch (error) {
    console.error("Question Attempt Analytics Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate question attempt analytics",
      error: error.message,
    });
  }
};

/*------------------------------------------------------------*/
/* Calculate the Average marks in the subject                 */
/*------------------------------------------------------------*/
const getSubjectAverageMarks = async (req, res) => {
  try {
    const analytics = [];

    const subjects = await Subject.find({
      isActive: true,
    }).lean();

    const annotationRoot = path.join(process.cwd(), "BookletAnnotations");

    let userFolders = [];

    try {
      userFolders = await fs.readdir(annotationRoot);
    } catch {
      userFolders = [];
    }

    for (const subject of subjects) {
      try {
        /*
        ========================================
        GET TASKS
        ========================================
        */

        const tasks = await BookletTask.find({
          subjectCode: subject.code,
        })
          .select("_id")
          .lean();

        const taskIds = tasks.map((t) => t._id);

        if (!taskIds.length) {
          analytics.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,
            totalBooklets: 0,
            totalMarks: 0,
            averageMarks: 0,
          });

          continue;
        }

        /*
        ========================================
        GET COMPLETED BOOKLETS
        ========================================
        */

        const booklets = await BookletAnswerPdf.find({
          bookletTaskId: {
            $in: taskIds,
          },
          status: "true",
        })
          .select("_id")
          .lean();

        let totalBooklets = 0;
        let totalMarks = 0;

        /*
        ========================================
        PROCESS EACH BOOKLET
        ========================================
        */

        for (const booklet of booklets) {
          const bookletId = booklet._id.toString();

          let marksDataFile = null;

          /*
          Find:
          BookletAnnotations/userId/bookletId
          */

          for (const userId of userFolders) {
            const bookletFolder = path.join(annotationRoot, userId, bookletId);

            try {
              await fs.access(bookletFolder);

              marksDataFile = path.join(bookletFolder, "marksData.json");

              break;
            } catch {
              continue;
            }
          }

          if (!marksDataFile) {
            continue;
          }

          /*
          ========================================
          READ MARKS DATA
          ========================================
          */

          let marksData = [];

          try {
            const content = await fs.readFile(marksDataFile, "utf8");

            marksData = JSON.parse(content)?.marks || [];
          } catch {
            continue;
          }

          /*
          ========================================
          CALCULATE BOOKLET TOTAL
          ========================================
          */

          let bookletMarks = 0;

          marksData.forEach((q) => {
            const isChildQuestion = q.parentQuestionId !== null;

            if (isChildQuestion) {
              return;
            }

            bookletMarks += Number(q.allottedMarks || 0);
          });

          totalMarks += bookletMarks;
          totalBooklets++;
        }

        /*
        ========================================
        CALCULATE AVERAGE
        ========================================
        */

        const averageMarks =
          totalBooklets === 0
            ? 0
            : Number((totalMarks / totalBooklets).toFixed(2));

        analytics.push({
          subjectId: subject._id,
          subjectName: subject.name,
          subjectCode: subject.code,
          totalBooklets,
          totalMarks,
          averageMarks,
        });
      } catch (err) {
        console.error(`Average marks failed for ${subject.name}`, err);
      }
    }

    return res.status(200).json({
      success: true,
      count: analytics.length,
      data: analytics,
    });
  } catch (error) {
    console.error("Average Marks Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to calculate average marks",
      error: error.message,
    });
  }
};

/*-------------------------------------------------------------------------*/
/* Calculate the Average marks For the User for its alloted subjects       */
/*-------------------------------------------------------------------------*/
const getEvaluatorAverageMarks = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const analytics = [];

    const annotationRoot = path.join(process.cwd(), "BookletAnnotations");

    /*
    =====================================================
    SUBJECT IDS ARE STORED IN USER.SUBJECTCODE
    =====================================================
    */

    const subjectIds = user.subjectCode || [];

    if (!subjectIds.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    /*
    =====================================================
    GET SUBJECTS
    =====================================================
    */

    const subjects = await Subject.find({
      _id: {
        $in: subjectIds,
      },
      isActive: true,
    }).lean();

    for (const subject of subjects) {
      try {
        /*
        =====================================================
        GET TASKS OF SUBJECT
        =====================================================
        */

        const tasks = await BookletTask.find({
          subjectCode: subject.code,
        })
          .select("_id")
          .lean();

        const taskIds = tasks.map((t) => t._id);

        if (!taskIds.length) {
          analytics.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,
            totalBooklets: 0,
            totalMarks: 0,
            averageMarks: 0,
          });

          continue;
        }

        /*
        =====================================================
        GET COMPLETED BOOKLETS
        =====================================================
        */

        const booklets = await BookletAnswerPdf.find({
          bookletTaskId: {
            $in: taskIds,
          },
          status: "true",
        })
          .select("_id")
          .lean();

        let totalBooklets = 0;
        let totalMarks = 0;

        /*
        =====================================================
        PROCESS BOOKLETS
        =====================================================
        */

        for (const booklet of booklets) {
          const bookletId = booklet._id.toString();

          const bookletFolder = path.join(annotationRoot, userId, bookletId);

          const marksDataFile = path.join(bookletFolder, "marksData.json");

          try {
            await fs.access(marksDataFile);
          } catch {
            /*
            Evaluator has not
            evaluated this booklet
            */
            continue;
          }

          /*
          =====================================================
          READ MARKS DATA
          =====================================================
          */

          let marksData = [];

          try {
            const content = await fs.readFile(marksDataFile, "utf8");

            marksData = JSON.parse(content)?.marks || [];
          } catch {
            continue;
          }

          /*
          =====================================================
          CALCULATE BOOKLET TOTAL
          =====================================================
          */

          let bookletMarks = 0;

          marksData.forEach((q) => {
            /*
              Skip child questions
              Example:
              Q1.1
              Q1.2
              */

            const isChild = q.parentQuestionId !== null;

            if (isChild) {
              return;
            }

            bookletMarks += Number(q.allottedMarks || 0);
          });

          totalMarks += bookletMarks;

          totalBooklets++;
        }

        /*
        =====================================================
        CALCULATE AVERAGE
        =====================================================
        */

        const averageMarks =
          totalBooklets === 0
            ? 0
            : Number((totalMarks / totalBooklets).toFixed(2));

        analytics.push({
          subjectId: subject._id,
          subjectName: subject.name,
          subjectCode: subject.code,
          totalBooklets,
          totalMarks,
          averageMarks,
        });
      } catch (err) {
        console.error(`Average marks failed for ${subject.name}`, err);
      }
    }

    return res.status(200).json({
      success: true,
      count: analytics.length,
      data: analytics,
    });
  } catch (error) {
    console.error("Evaluator Average Marks Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to calculate evaluator average marks",
      error: error.message,
    });
  }
};

/*------------------------------------------------------------*/
/* Download the user's data into CSV file                     */
/*------------------------------------------------------------*/
const downloadSingleUserDataCsv = async (req, res) => {
  try {
    const { userId } = req.params;

    /*
    =====================================================
    USER DETAILS
    =====================================================
    */

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    /*
    =====================================================
    LOGIN DETAILS
    =====================================================
    */

    const loginLogs = await UserLoginLogs.find({ userId })
      .sort({ loginAt: -1 })
      .lean();

    const activeSession = await UserLoginLogs.exists({
      userId,
      status: 1,
    });

    /*
    =====================================================
    QUESTION ASSIGNMENTS
    =====================================================
    */

    const questionAssigned = await Task.countDocuments({
      userId,
    });

    const questionCompleted = await Task.countDocuments({
      userId,
      status: "completed",
    });

    /*
    =====================================================
    BOOKLET ASSIGNMENTS
    =====================================================
    */

    const bookletTasks = await BookletTask.find({
      userId,
    }).select("_id subjectCode");

    const bookletTaskIds = bookletTasks.map((t) => t._id);

    const bookletAssigned = await BookletAnswerPdf.countDocuments({
      bookletTaskId: {
        $in: bookletTaskIds,
      },
    });

    const bookletCompleted = await BookletAnswerPdf.countDocuments({
      bookletTaskId: {
        $in: bookletTaskIds,
      },
      status: "true",
    });

    /*
    =====================================================
    EFFICIENCY
    =====================================================
    */

    const efficiency =
      bookletAssigned > 0
        ? Number(((bookletCompleted / bookletAssigned) * 100).toFixed(2))
        : 0;

    /*
    =====================================================
    ATTENDANCE
    =====================================================
    */

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayLogs = await UserLoginLogs.find({
      userId,
      loginAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    }).lean();

    const loginCount = todayLogs.length;
    const currentlyLoggedIn = !!activeSession;

    /*
    =====================================================
    SUBJECTS
    =====================================================
    */

    const subjects = await Subject.find({
      _id: {
        $in: user.subjectCode || [],
      },
    }).lean();

    const subjectNames = subjects.map((s) => s.name).join(", ");

    /*
    =====================================================
    PASS / FAIL SUMMARY
    =====================================================
    */

    const relations = await CourseSchemaRelation.find({
      subjectId: {
        $in: subjects.map((s) => s._id),
      },
    }).populate("schemaId");

    const schemaMap = {};

    relations.forEach((relation) => {
      const subject = subjects.find(
        (s) => s._id.toString() === relation.subjectId.toString(),
      );

      if (!subject || !relation.schemaId) return;

      schemaMap[subject.code] = {
        minMarks: relation.schemaId.minMarks,
        schemaType: relation.schemaId.schemaType,
      };
    });

    let totalStudents = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    for (const task of bookletTasks) {
      const schemaInfo = schemaMap[task.subjectCode];

      if (!schemaInfo) continue;

      const answerPdfs = await BookletAnswerPdf.find({
        bookletTaskId: task._id,
      }).select("_id");

      totalStudents += answerPdfs.length;

      const bookletIds = answerPdfs.map((pdf) => pdf._id);

      const totals = await BookletMarks.aggregate([
        {
          $match: {
            bookletAnswerPdfId: {
              $in: bookletIds,
            },
          },
        },
        {
          $group: {
            _id: "$bookletAnswerPdfId",
            totalMarks: {
              $sum: "$allottedMarks",
            },
          },
        },
      ]);

      totals.forEach((booklet) => {
        if (booklet.totalMarks >= schemaInfo.minMarks) {
          totalPassed++;
        } else {
          totalFailed++;
        }
      });
    }

    const checkedStudents = totalPassed + totalFailed;

    const passPercentage =
      checkedStudents > 0
        ? Number(((totalPassed / checkedStudents) * 100).toFixed(2))
        : 0;

    const failPercentage =
      checkedStudents > 0
        ? Number(((totalFailed / checkedStudents) * 100).toFixed(2))
        : 0;

    /*
    =====================================================
    SUBJECT AVERAGE MARKS
    =====================================================
    */

    const annotationRoot = path.join(process.cwd(), "BookletAnnotations");

    const averageMarksData = [];

    for (const subject of subjects) {
      const tasks = await BookletTask.find({
        userId,
        subjectCode: subject.code,
      })
        .select("_id")
        .lean();

      const taskIds = tasks.map((t) => t._id);

      const booklets = await BookletAnswerPdf.find({
        bookletTaskId: {
          $in: taskIds,
        },
        status: "true",
      })
        .select("_id")
        .lean();

      let totalMarks = 0;
      let totalBooklets = 0;

      for (const booklet of booklets) {
        const marksFile = path.join(
          annotationRoot,
          userId,
          booklet._id.toString(),
          "marksData.json",
        );

        try {
          await fs.access(marksFile);

          const content = await fs.readFile(marksFile, "utf8");

          const marks = JSON.parse(content)?.marks || [];

          let bookletTotal = 0;

          marks.forEach((q) => {
            if (q.parentQuestionId !== null) {
              return;
            }

            bookletTotal += Number(q.allottedMarks || 0);
          });

          totalMarks += bookletTotal;
          totalBooklets++;
        } catch {
          continue;
        }
      }

      averageMarksData.push(
        `${subject.name}: ${
          totalBooklets ? (totalMarks / totalBooklets).toFixed(2) : 0
        }`,
      );
    }

    /*
    =====================================================
    CSV DATA
    =====================================================
    */

    const csvData = [
      {
        Name: user.name,
        Email: user.email,
        Mobile: user.mobile,
        Role: user.role,
        Subjects: subjectNames,
        MaxBooklets: user.maxBooklets,
        LimitType: user.limitType,

        TotalLogins: loginLogs.length,
        LastLogin: loginLogs[0]?.loginAt || "",

        LoginCountToday: loginCount,
        CurrentlyLoggedIn: currentlyLoggedIn,

        QuestionAssigned: questionAssigned,
        QuestionCompleted: questionCompleted,

        BookletAssigned: bookletAssigned,
        BookletCompleted: bookletCompleted,

        TotalStudents: totalStudents,
        CheckedStudents: checkedStudents,
        PassedStudents: totalPassed,
        FailedStudents: totalFailed,
        PassPercentage: `${passPercentage}%`,
        FailPercentage: `${failPercentage}%`,

        Efficiency: `${efficiency}%`,
        SubjectAverageMarks: averageMarksData.join(" | "),
      },
    ];

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${user.name.replace(/\s+/g, "_")}_report.csv"`,
    );

    return res.status(200).send(csv);
  } catch (error) {
    console.error("Download User CSV Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to download user data",
      error: error.message,
    });
  }
};

/*-----------------------------------------------------------------------*/
/* User Data Using Date Wise Filter Applying                             */
/*-----------------------------------------------------------------------*/

const getUserDataByDateRange = async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to, assignmentType = "booklet" } = req.query;

    console.log("Fetching user data for user:", userId, "From:", from, "To:", to, "Assignment Type:", assignmentType);

    /*
    =====================================================
    VALIDATION
    =====================================================
    */

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "from and to are required.",
      });
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    if (isNaN(fromDate) || isNaN(toDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format.",
      });
    }

    /*
    =====================================================
    USER
    =====================================================
    */

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("User for MIS -: ", user);

    /*
    =====================================================
    SUBJECTS
    =====================================================
    */

    const subjects = await Subject.find({
      _id: {
        $in: user.subjectCode || [],
      },
    }).lean();

    console.log("Subjects for MIS -: ", subjects);

    /*
    =====================================================
    LOGIN LOGS
    =====================================================
    */

    const loginLogs = await UserLoginLogs.find({
      userId,
      loginAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    })
      .sort({
        loginAt: -1,
      })
      .lean();

    const activeSession = await UserLoginLogs.exists({
      userId,
      status: 1,
    });

    const loginSummary = {
      totalLogins: loginLogs.length,

      currentlyLoggedIn: !!activeSession,

      firstLogin:
        loginLogs.length > 0 ? loginLogs[loginLogs.length - 1].loginAt : null,

      lastLogin: loginLogs.length > 0 ? loginLogs[0].loginAt : null,

      lastLogout: loginLogs.find((log) => log.logoutAt)?.logoutAt || null,

      loginLogs,
    };

    console.log("Login Summary for MIS -: ", loginSummary);

    /*
    =====================================================
    ATTENDANCE
    =====================================================
    */

    /*
      Attendance should start from
      whichever is later:

      user.createdAt
      OR
      selected from date
    */

    const attendanceStart =
      new Date(user.createdAt) > fromDate ? new Date(user.createdAt) : fromDate;

    const attendanceLogs = loginLogs.filter(
      (log) => new Date(log.loginAt) >= attendanceStart,
    );

    const attendanceDays = new Set();

    attendanceLogs.forEach((log) => {
      attendanceDays.add(new Date(log.loginAt).toISOString().split("T")[0]);
    });

    const presentDays = attendanceDays.size;

    const totalDays =
      Math.floor((toDate - attendanceStart) / (1000 * 60 * 60 * 24)) + 1;

    const attendance = {
      from: attendanceStart,

      to: toDate,

      totalDays,

      presentDays,

      absentDays: Math.max(totalDays - presentDays, 0),

      attendancePercentage:
        totalDays > 0
          ? Number(((presentDays / totalDays) * 100).toFixed(2))
          : 0,

      sessions: attendanceLogs,
    };

    /*
    =====================================================
    GET USER TASKS
    =====================================================
    */

    let bookletTasks = [];
    let bookletTaskIds = [];

    let questionTasks = [];
    let questionTaskIds = [];

    if (assignmentType === "booklet") {
      bookletTasks = await BookletTask.find({
        userId,
      })
        .select("_id subjectCode")
        .lean();

      bookletTaskIds = bookletTasks.map((task) => task._id);
    } else {
      questionTasks = await Task.find({
        userId,
      })
        .select("_id subjectCode")
        .lean();

      questionTaskIds = questionTasks.map((task) => task._id);
    }

    console.log("Booklet Tasks for MIS -: ", bookletTasks);
    console.log("Question Tasks for MIS -: ", questionTasks);

    /*
    =====================================================
    CREATE SUBJECT -> TASK MAP

    This removes multiple MongoDB queries later.
    =====================================================
    */

    const subjectTaskMap = {};

    if (assignmentType === "booklet") {
      bookletTasks.forEach((task) => {
        if (!subjectTaskMap[task.subjectCode]) {
          subjectTaskMap[task.subjectCode] = [];
        }

        subjectTaskMap[task.subjectCode].push(task._id);
      });
    } else {
      questionTasks.forEach((task) => {
        if (!subjectTaskMap[task.subjectCode]) {
          subjectTaskMap[task.subjectCode] = [];
        }

        subjectTaskMap[task.subjectCode].push(task._id);
      });
    }

    console.log("Subject Task Map for MIS -: ", subjectTaskMap);

    /*
    =====================================================
    GET SCHEMA RELATIONS
    =====================================================
    */

    const relations = await CourseSchemaRelation.find({
      subjectId: {
        $in: subjects.map((subject) => subject._id),
      },
    }).populate("schemaId");

    const schemaMap = {};

    relations.forEach((relation) => {
      const subject = subjects.find(
        (s) => s._id.toString() === relation.subjectId.toString(),
      );

      if (!subject || !relation.schemaId) return;

      schemaMap[subject.code] = {
        minMarks: relation.schemaId.minMarks,

        schemaType: relation.schemaId.schemaType,
      };
    });

    console.log("Schema Map for MIS -: ", schemaMap);

    /*
    =====================================================
    BOOKLET ANNOTATION ROOT
    =====================================================
    */

    const annotationRoot = path.join(process.cwd(), "BookletAnnotations");

    /*
    =====================================================
    EFFICIENCY
    =====================================================
    */

    let overallAssigned = 0;
    let overallCompleted = 0;

    const subjectEfficiency = [];

    /*
    =====================================================
    BOOKLET WISE
    =====================================================
    */

    if (assignmentType === "booklet") {
      for (const subject of subjects) {
        const taskIds = subjectTaskMap[subject.code] || [];

        if (!taskIds.length) {
          subjectEfficiency.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,

            assigned: 0,
            completed: 0,
            remaining: 0,
            efficiency: 0,
          });

          continue;
        }

        /*
        --------------------------------------------
        ASSIGNED
        --------------------------------------------
        */

        const assigned = await BookletAnswerPdf.countDocuments({
          bookletTaskId: {
            $in: taskIds,
          },
          assignedDate: {
            $gte: fromDate,
            $lte: toDate,
          },
        });

        console.log(`Subject: ${subject.name}, Assigned Booklets: ${assigned}`);

        /*
        --------------------------------------------
        COMPLETED
        --------------------------------------------
        */

        const completed = await BookletAnswerPdf.countDocuments({
          bookletTaskId: {
            $in: taskIds,
          },
          status: "true",
          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        });

        overallAssigned += assigned;
        overallCompleted += completed;

        subjectEfficiency.push({
          subjectId: subject._id,

          subjectName: subject.name,

          subjectCode: subject.code,

          assigned,

          completed,

          remaining: assigned - completed,

          efficiency:
            assigned > 0
              ? Number(((completed / assigned) * 100).toFixed(2))
              : 0,
        });
      }
    } else {
      /*
    =====================================================
    QUESTION WISE
    =====================================================
    */
      for (const subject of subjects) {
        const taskIds = subjectTaskMap[subject.code] || [];

        if (!taskIds.length) {
          subjectEfficiency.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,

            assigned: 0,
            completed: 0,
            remaining: 0,
            efficiency: 0,
          });

          continue;
        }

        const assigned = await AnswerPdf.countDocuments({
          taskId: {
            $in: taskIds,
          },
          createdAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        });

        const completed = await AnswerPdf.countDocuments({
          taskId: {
            $in: taskIds,
          },
          status: "true",
          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        });

        overallAssigned += assigned;
        overallCompleted += completed;

        subjectEfficiency.push({
          subjectId: subject._id,

          subjectName: subject.name,

          subjectCode: subject.code,

          assigned,

          completed,

          remaining: assigned - completed,

          efficiency:
            assigned > 0
              ? Number(((completed / assigned) * 100).toFixed(2))
              : 0,
        });
      }
    }

    console.log("Overall Assigned:", overallAssigned);
    console.log("Overall Completed:", overallCompleted);
    console.log("Subject Efficiency:", subjectEfficiency);

    /*
    =====================================================
    OVERALL EFFICIENCY
    =====================================================
    */

    const efficiency = {
      assigned: overallAssigned,

      completed: overallCompleted,

      remaining: overallAssigned - overallCompleted,

      efficiency:
        overallAssigned > 0
          ? Number(((overallCompleted / overallAssigned) * 100).toFixed(2))
          : 0,

      subjects: subjectEfficiency,
    };

    console.log("Overall Efficiency:", efficiency);
    
    /*
    =====================================================
    PASS / FAIL VARIABLES
    =====================================================
    */

    let totalStudents = 0;
    let checkedStudents = 0;

    let totalPassed = 0;
    let totalFailed = 0;

    const subjectPassFail = [];

    /*
    =====================================================
    PART-3 STARTS HERE
    =====================================================
    */
    /*
    =====================================================
    BOOKLET WISE PASS / FAIL
    =====================================================
    */

    if (assignmentType === "booklet") {
      for (const subject of subjects) {
        const taskIds = subjectTaskMap[subject.code] || [];

        let subjectTotalStudents = 0;
        let subjectCheckedStudents = 0;
        let subjectPassed = 0;
        let subjectFailed = 0;

        if (!taskIds.length) {
          subjectPassFail.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,

            totalStudents: 0,
            checkedStudents: 0,

            passedStudents: 0,
            failedStudents: 0,

            passPercentage: 0,
            failPercentage: 0,
          });

          continue;
        }

        const schemaInfo = schemaMap[subject.code];

        if (!schemaInfo) continue;

        const evaluatedBooklets = await BookletAnswerPdf.find({
          bookletTaskId: {
            $in: taskIds,
          },
          status: "true",
          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        })
          .select("_id")
          .lean();

        subjectTotalStudents = evaluatedBooklets.length;

        const bookletIds = evaluatedBooklets.map((booklet) => booklet._id);

        if (bookletIds.length) {
          const totals = await BookletMarks.aggregate([
            {
              $match: {
                bookletAnswerPdfId: {
                  $in: bookletIds,
                },
              },
            },
            {
              $group: {
                _id: "$bookletAnswerPdfId",

                totalMarks: {
                  $sum: "$allottedMarks",
                },
              },
            },
          ]);

          subjectCheckedStudents = totals.length;

          totals.forEach((booklet) => {
            if (booklet.totalMarks >= schemaInfo.minMarks) {
              subjectPassed++;
            } else {
              subjectFailed++;
            }
          });
        }

        totalStudents += subjectTotalStudents;

        checkedStudents += subjectCheckedStudents;

        totalPassed += subjectPassed;

        totalFailed += subjectFailed;

        subjectPassFail.push({
          subjectId: subject._id,

          subjectName: subject.name,

          subjectCode: subject.code,

          totalStudents: subjectTotalStudents,

          checkedStudents: subjectCheckedStudents,

          passedStudents: subjectPassed,

          failedStudents: subjectFailed,

          passPercentage:
            subjectCheckedStudents > 0
              ? Number(
                  ((subjectPassed / subjectCheckedStudents) * 100).toFixed(2),
                )
              : 0,

          failPercentage:
            subjectCheckedStudents > 0
              ? Number(
                  ((subjectFailed / subjectCheckedStudents) * 100).toFixed(2),
                )
              : 0,
        });
      }
    } else {
      /*
    =====================================================
    PART-3A-2 STARTS HERE
    =====================================================
    */
      /*
    =====================================================
    QUESTION WISE PASS / FAIL
    =====================================================
    */
      for (const subject of subjects) {
        const taskIds = subjectTaskMap[subject.code] || [];

        let subjectTotalStudents = 0;
        let subjectCheckedStudents = 0;
        let subjectPassed = 0;
        let subjectFailed = 0;

        if (!taskIds.length) {
          subjectPassFail.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,

            totalStudents: 0,
            checkedStudents: 0,

            passedStudents: 0,
            failedStudents: 0,

            passPercentage: 0,
            failPercentage: 0,
          });

          continue;
        }

        const schemaInfo = schemaMap[subject.code];

        if (!schemaInfo) continue;

        const answerPdfs = await AnswerPdf.find({
          taskId: {
            $in: taskIds,
          },
          status: "true",
          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        })
          .select("_id")
          .lean();

        subjectTotalStudents = answerPdfs.length;

        const answerPdfIds = answerPdfs.map((pdf) => pdf._id);

        if (answerPdfIds.length) {
          const totals = await Marks.aggregate([
            {
              $match: {
                answerPdfId: {
                  $in: answerPdfIds,
                },
              },
            },
            {
              $group: {
                _id: "$answerPdfId",

                totalMarks: {
                  $sum: "$allottedMarks",
                },
              },
            },
          ]);

          subjectCheckedStudents = totals.length;

          totals.forEach((answer) => {
            if (answer.totalMarks >= schemaInfo.minMarks) {
              subjectPassed++;
            } else {
              subjectFailed++;
            }
          });
        }

        totalStudents += subjectTotalStudents;

        checkedStudents += subjectCheckedStudents;

        totalPassed += subjectPassed;

        totalFailed += subjectFailed;

        subjectPassFail.push({
          subjectId: subject._id,

          subjectName: subject.name,

          subjectCode: subject.code,

          totalStudents: subjectTotalStudents,

          checkedStudents: subjectCheckedStudents,

          passedStudents: subjectPassed,

          failedStudents: subjectFailed,

          passPercentage:
            subjectCheckedStudents > 0
              ? Number(
                  ((subjectPassed / subjectCheckedStudents) * 100).toFixed(2),
                )
              : 0,

          failPercentage:
            subjectCheckedStudents > 0
              ? Number(
                  ((subjectFailed / subjectCheckedStudents) * 100).toFixed(2),
                )
              : 0,
        });
      }
    }

    /*
    =====================================================
    PASS / FAIL SUMMARY
    =====================================================
    */

    const passFailSummary = {
      totalStudents,

      checkedStudents,

      passedStudents: totalPassed,

      failedStudents: totalFailed,

      passPercentage:
        checkedStudents > 0
          ? Number(((totalPassed / checkedStudents) * 100).toFixed(2))
          : 0,

      failPercentage:
        checkedStudents > 0
          ? Number(((totalFailed / checkedStudents) * 100).toFixed(2))
          : 0,

      subjects: subjectPassFail,
    };

    /*
    =====================================================
    PART-3B STARTS HERE
    =====================================================
    */
    /*
    =====================================================
    SUBJECT WISE AVERAGE MARKS
    =====================================================
    */

    const averageMarks = [];

    if (assignmentType === "booklet") {
      for (const subject of subjects) {
        const taskIds = subjectTaskMap[subject.code] || [];

        let totalMarks = 0;
        let totalBooklets = 0;

        if (!taskIds.length) {
          averageMarks.push({
            subjectId: subject._id,
            subjectName: subject.name,
            subjectCode: subject.code,
            totalBooklets: 0,
            totalMarks: 0,
            averageMarks: 0,
          });

          continue;
        }

        const evaluatedBooklets = await BookletAnswerPdf.find({
          bookletTaskId: {
            $in: taskIds,
          },
          status: "true",
          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        })
          .select("_id")
          .lean();

        for (const booklet of evaluatedBooklets) {
          const marksFile = path.join(
            annotationRoot,
            userId,
            booklet._id.toString(),
            "marksData.json",
          );

          try {
            await fs.access(marksFile);

            const content = await fs.readFile(marksFile, "utf8");

            const marks = JSON.parse(content)?.marks || [];

            let bookletTotal = 0;

            marks.forEach((question) => {
              if (question.parentQuestionId !== null) return;

              bookletTotal += Number(question.allottedMarks || 0);
            });

            totalMarks += bookletTotal;
            totalBooklets++;
          } catch {
            continue;
          }
        }

        averageMarks.push({
          subjectId: subject._id,

          subjectName: subject.name,

          subjectCode: subject.code,

          totalBooklets,

          totalMarks,

          averageMarks:
            totalBooklets > 0
              ? Number((totalMarks / totalBooklets).toFixed(2))
              : 0,
        });
      }
    }

    /*
    =====================================================
    FINAL RESPONSE
    =====================================================
    */

    return res.status(200).json({
      success: true,

      dateRange: {
        from: fromDate,
        to: toDate,
      },

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        maxBooklets: user.maxBooklets,
        limitType: user.limitType,

        subjects: subjects.map((subject) => ({
          _id: subject._id,
          name: subject.name,
          code: subject.code,
        })),
      },

      loginSummary,

      attendance,

      efficiency,

      passFailSummary,

      averageMarks,
    });
  } catch (error) {
    console.error("User Dashboard Date Range Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user dashboard.",
      error: error.message,
    });
  }
};

/*-----------------------------------------------------------------------*/
/* Download User Data CSV By Date Range                                  */
/*-----------------------------------------------------------------------*/

const downloadUserDataByDateRangeCsv = async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to, assignmentType = "booklet" } = req.query;

    /*
    =====================================================
    VALIDATION
    =====================================================
    */

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "from and to query parameters are required.",
      });
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    if (isNaN(fromDate) || isNaN(toDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format.",
      });
    }

    /*
    =====================================================
    USER
    =====================================================
    */

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    /*
    =====================================================
    SUBJECTS
    =====================================================
    */

    const subjects = await Subject.find({
      _id: {
        $in: user.subjectCode || [],
      },
    }).lean();

    /*
    =====================================================
    LOGIN LOGS
    =====================================================
    */

    const loginLogs = await UserLoginLogs.find({
      userId,
      loginAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    })
      .sort({
        loginAt: -1,
      })
      .lean();

    const activeSession = await UserLoginLogs.exists({
      userId,
      status: 1,
    });

    const loginSummary = {
      totalLogins: loginLogs.length,

      currentlyLoggedIn: !!activeSession,

      firstLogin: loginLogs.length
        ? loginLogs[loginLogs.length - 1].loginAt
        : null,

      lastLogin: loginLogs.length ? loginLogs[0].loginAt : null,

      lastLogout: loginLogs.find((l) => l.logoutAt)?.logoutAt || null,
    };

    /*
    =====================================================
    ATTENDANCE
    =====================================================
    */

    const attendanceStart =
      new Date(user.createdAt) > fromDate ? new Date(user.createdAt) : fromDate;

    const attendanceLogs = loginLogs.filter(
      (log) => new Date(log.loginAt) >= attendanceStart,
    );

    const attendanceDays = new Set();

    attendanceLogs.forEach((log) => {
      attendanceDays.add(new Date(log.loginAt).toISOString().split("T")[0]);
    });

    const presentDays = attendanceDays.size;

    const totalDays =
      Math.floor((toDate - attendanceStart) / (1000 * 60 * 60 * 24)) + 1;

    const attendance = {
      totalDays,

      presentDays,

      absentDays: Math.max(totalDays - presentDays, 0),

      attendancePercentage:
        totalDays > 0
          ? Number(((presentDays / totalDays) * 100).toFixed(2))
          : 0,
    };

    /*
    =====================================================
    TASKS
    =====================================================
    */

    let bookletTasks = [];
    let bookletTaskIds = [];

    let questionTasks = [];
    let questionTaskIds = [];

    if (assignmentType === "booklet") {
      bookletTasks = await BookletTask.find({
        userId,
      })
        .select("_id subjectCode")
        .lean();

      bookletTaskIds = bookletTasks.map((task) => task._id);
    } else {
      questionTasks = await Task.find({
        userId,
      })
        .select("_id subjectCode")
        .lean();

      questionTaskIds = questionTasks.map((task) => task._id);
    }

    /*
    =====================================================
    SUBJECT TASK MAP
    =====================================================
    */

    const subjectTaskMap = {};

    if (assignmentType === "booklet") {
      bookletTasks.forEach((task) => {
        if (!subjectTaskMap[task.subjectCode]) {
          subjectTaskMap[task.subjectCode] = [];
        }

        subjectTaskMap[task.subjectCode].push(task._id);
      });
    } else {
      questionTasks.forEach((task) => {
        if (!subjectTaskMap[task.subjectCode]) {
          subjectTaskMap[task.subjectCode] = [];
        }

        subjectTaskMap[task.subjectCode].push(task._id);
      });
    }

    /*
    =====================================================
    SCHEMA MAP
    =====================================================
    */

    const relations = await CourseSchemaRelation.find({
      subjectId: {
        $in: subjects.map((s) => s._id),
      },
    }).populate("schemaId");

    const schemaMap = {};

    relations.forEach((relation) => {
      const subject = subjects.find(
        (s) => s._id.toString() === relation.subjectId.toString(),
      );

      if (!subject || !relation.schemaId) return;

      schemaMap[subject.code] = {
        minMarks: relation.schemaId.minMarks,

        schemaType: relation.schemaId.schemaType,
      };
    });

    const annotationRoot = path.join(process.cwd(), "BookletAnnotations");

    /*
    =====================================================
    PART-2 STARTS HERE
    =====================================================
    */
    /*
    =====================================================
    SUBJECT ANALYTICS
    =====================================================
    */

    const subjectAnalytics = [];

    let overallAssigned = 0;
    let overallCompleted = 0;

    /*
    =====================================================
    SUBJECT WISE EFFICIENCY
    =====================================================
    */

    for (const subject of subjects) {
      const taskIds = subjectTaskMap[subject.code] || [];

      let assigned = 0;
      let completed = 0;

      /*
        ---------------------------------------
        BOOKLET WISE
        ---------------------------------------
        */

      if (assignmentType === "booklet") {
        assigned = await BookletAnswerPdf.countDocuments({
          bookletTaskId: {
            $in: taskIds,
          },

          assignedDate: {
            $gte: fromDate,
            $lte: toDate,
          },
        });

        completed = await BookletAnswerPdf.countDocuments({
          bookletTaskId: {
            $in: taskIds,
          },

          status: "true",

          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        });
      } else {

      /*
        ---------------------------------------
        QUESTION WISE
        ---------------------------------------
        */
        assigned = await AnswerPdf.countDocuments({
          taskId: {
            $in: taskIds,
          },

          createdAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        });

        completed = await AnswerPdf.countDocuments({
          taskId: {
            $in: taskIds,
          },

          status: "true",

          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        });
      }

      overallAssigned += assigned;
      overallCompleted += completed;

      subjectAnalytics.push({
        subjectId: subject._id,

        subjectName: subject.name,

        subjectCode: subject.code,

        efficiency: {
          assigned,

          completed,

          remaining: assigned - completed,

          efficiency:
            assigned > 0
              ? Number(((completed / assigned) * 100).toFixed(2))
              : 0,
        },

        passFail: {},

        averageMarks: {},
      });
    }

    /*
    =====================================================
    OVERALL EFFICIENCY
    =====================================================
    */

    const efficiency = {
      assigned: overallAssigned,

      completed: overallCompleted,

      remaining: overallAssigned - overallCompleted,

      efficiency:
        overallAssigned > 0
          ? Number(((overallCompleted / overallAssigned) * 100).toFixed(2))
          : 0,
    };

    /*
    =====================================================
    OVERALL PASS FAIL VARIABLES
    =====================================================
    */

    let totalStudents = 0;
    let checkedStudents = 0;

    let totalPassed = 0;
    let totalFailed = 0;

    /*
    =====================================================
    PART-3 STARTS HERE
    =====================================================
    */
    /*
    =====================================================
    SUBJECT PASS / FAIL
    =====================================================
    */

    for (const analytics of subjectAnalytics) {
      const schemaInfo = schemaMap[analytics.subjectCode];

      if (!schemaInfo) continue;

      const taskIds = subjectTaskMap[analytics.subjectCode] || [];

      let subjectTotalStudents = 0;
      let subjectCheckedStudents = 0;
      let subjectPassed = 0;
      let subjectFailed = 0;

      /*
        ==========================================
        BOOKLET WISE
        ==========================================
        */

      if (assignmentType === "booklet") {
        const evaluatedBooklets = await BookletAnswerPdf.find({
          bookletTaskId: {
            $in: taskIds,
          },

          status: "true",

          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        })
          .select("_id")
          .lean();

        subjectTotalStudents = evaluatedBooklets.length;

        const bookletIds = evaluatedBooklets.map((b) => b._id);

        if (bookletIds.length) {
          const totals = await BookletMarks.aggregate([
            {
              $match: {
                bookletAnswerPdfId: {
                  $in: bookletIds,
                },
              },
            },

            {
              $group: {
                _id: "$bookletAnswerPdfId",

                totalMarks: {
                  $sum: "$allottedMarks",
                },
              },
            },
          ]);

          subjectCheckedStudents = totals.length;

          totals.forEach((booklet) => {
            if (booklet.totalMarks >= schemaInfo.minMarks) {
              subjectPassed++;
            } else {
              subjectFailed++;
            }
          });
        }
      } else {

      /*
        ==========================================
        QUESTION WISE
        ==========================================
        */
        const answerPdfs = await AnswerPdf.find({
          taskId: {
            $in: taskIds,
          },

          status: "true",

          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        })
          .select("_id")
          .lean();

        subjectTotalStudents = answerPdfs.length;

        const answerPdfIds = answerPdfs.map((pdf) => pdf._id);

        if (answerPdfIds.length) {
          const totals = await Marks.aggregate([
            {
              $match: {
                answerPdfId: {
                  $in: answerPdfIds,
                },
              },
            },

            {
              $group: {
                _id: "$answerPdfId",

                totalMarks: {
                  $sum: "$allottedMarks",
                },
              },
            },
          ]);

          subjectCheckedStudents = totals.length;

          totals.forEach((answer) => {
            if (answer.totalMarks >= schemaInfo.minMarks) {
              subjectPassed++;
            } else {
              subjectFailed++;
            }
          });
        }
      }

      /*
        ==========================================
        UPDATE OVERALL
        ==========================================
        */

      totalStudents += subjectTotalStudents;

      checkedStudents += subjectCheckedStudents;

      totalPassed += subjectPassed;

      totalFailed += subjectFailed;

      /*
        ==========================================
        STORE INSIDE SUBJECT ANALYTICS
        ==========================================
        */

      analytics.passFail = {
        totalStudents: subjectTotalStudents,

        checkedStudents: subjectCheckedStudents,

        passedStudents: subjectPassed,

        failedStudents: subjectFailed,

        passPercentage:
          subjectCheckedStudents > 0
            ? Number(
                ((subjectPassed / subjectCheckedStudents) * 100).toFixed(2),
              )
            : 0,

        failPercentage:
          subjectCheckedStudents > 0
            ? Number(
                ((subjectFailed / subjectCheckedStudents) * 100).toFixed(2),
              )
            : 0,
      };
    }

    /*
    =====================================================
    OVERALL PASS FAIL
    =====================================================
    */

    const passFailSummary = {
      totalStudents,

      checkedStudents,

      passedStudents: totalPassed,

      failedStudents: totalFailed,

      passPercentage:
        checkedStudents > 0
          ? Number(((totalPassed / checkedStudents) * 100).toFixed(2))
          : 0,

      failPercentage:
        checkedStudents > 0
          ? Number(((totalFailed / checkedStudents) * 100).toFixed(2))
          : 0,
    };

    /*
    =====================================================
    PART-3B STARTS HERE
    =====================================================
    */
    /*
    =====================================================
    SUBJECT WISE AVERAGE MARKS
    =====================================================
    */

    if (assignmentType === "booklet") {
      for (const analytics of subjectAnalytics) {
        const taskIds = subjectTaskMap[analytics.subjectCode] || [];

        let totalBooklets = 0;
        let totalMarks = 0;

        if (!taskIds.length) {
          analytics.averageMarks = {
            totalBooklets: 0,

            totalMarks: 0,

            averageMarks: 0,
          };

          continue;
        }

        /*
            ==========================================
            GET EVALUATED BOOKLETS
            ==========================================
            */

        const evaluatedBooklets = await BookletAnswerPdf.find({
          bookletTaskId: {
            $in: taskIds,
          },

          status: "true",

          updatedAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        })
          .select("_id")
          .lean();

        /*
            ==========================================
            PROCESS BOOKLETS
            ==========================================
            */

        for (const booklet of evaluatedBooklets) {
          const marksFile = path.join(
            annotationRoot,

            userId,

            booklet._id.toString(),

            "marksData.json",
          );

          try {
            await fs.access(marksFile);

            const content = await fs.readFile(marksFile, "utf8");

            const marks = JSON.parse(content)?.marks || [];

            let bookletTotal = 0;

            marks.forEach((question) => {
              /*
                        Skip child questions
                        */

              if (question.parentQuestionId !== null) {
                return;
              }

              bookletTotal += Number(question.allottedMarks || 0);
            });

            totalBooklets++;

            totalMarks += bookletTotal;
          } catch {
            continue;
          }
        }

        /*
            ==========================================
            STORE
            ==========================================
            */

        analytics.averageMarks = {
          totalBooklets,

          totalMarks,

          averageMarks:
            totalBooklets > 0
              ? Number((totalMarks / totalBooklets).toFixed(2))
              : 0,
        };
      }
    }

    /*
    =====================================================
    PART-3B-2 STARTS HERE
    =====================================================
    */
    /*
    =====================================================
    CSV DATA
    =====================================================
    */

    const csvRows = [];

    /*
    =====================================================
    SUMMARY
    =====================================================
    */

    csvRows.push({
      Section: "SUMMARY",

      Name: user.name,

      Email: user.email,

      Mobile: user.mobile,

      Role: user.role,

      Subjects: subjects.map((s) => s.name).join(", "),

      DateFrom: from,

      DateTo: to,

      TotalLogins: loginSummary.totalLogins,

      FirstLogin: loginSummary.firstLogin,

      LastLogin: loginSummary.lastLogin,

      LastLogout: loginSummary.lastLogout,

      CurrentlyLoggedIn: loginSummary.currentlyLoggedIn,

      AttendanceDays: attendance.presentDays,

      TotalDays: attendance.totalDays,

      AttendancePercentage: attendance.attendancePercentage,

      Assigned: efficiency.assigned,

      Completed: efficiency.completed,

      Remaining: efficiency.remaining,

      Efficiency: `${efficiency.efficiency}%`,

      TotalStudents: passFailSummary.totalStudents,

      CheckedStudents: passFailSummary.checkedStudents,

      PassedStudents: passFailSummary.passedStudents,

      FailedStudents: passFailSummary.failedStudents,

      PassPercentage: `${passFailSummary.passPercentage}%`,

      FailPercentage: `${passFailSummary.failPercentage}%`,
    });

    /*
    =====================================================
    EMPTY ROW
    =====================================================
    */

    csvRows.push({});

    /*
    =====================================================
    SUBJECT WISE
    =====================================================
    */

    subjectAnalytics.forEach((subject) => {
      csvRows.push({
        Section: "SUBJECT",

        SubjectName: subject.subjectName,

        SubjectCode: subject.subjectCode,

        Assigned: subject.efficiency.assigned,

        Completed: subject.efficiency.completed,

        Remaining: subject.efficiency.remaining,

        Efficiency: `${subject.efficiency.efficiency}%`,

        TotalStudents: subject.passFail.totalStudents,

        CheckedStudents: subject.passFail.checkedStudents,

        PassedStudents: subject.passFail.passedStudents,

        FailedStudents: subject.passFail.failedStudents,

        PassPercentage: `${subject.passFail.passPercentage}%`,

        FailPercentage: `${subject.passFail.failPercentage}%`,

        TotalBooklets: subject.averageMarks.totalBooklets,

        TotalMarks: subject.averageMarks.totalMarks,

        AverageMarks: subject.averageMarks.averageMarks,
      });
    });

    /*
    =====================================================
    CREATE CSV
    =====================================================
    */

    const parser = new Parser();

    const csv = parser.parse(csvRows);

    /*
    =====================================================
    DOWNLOAD
    =====================================================
    */

    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${user.name.replace(/\s+/g, "_")}_${from}_to_${to}_MIS_Report.csv"`,
    );

    return res.status(200).send(csv);
  } catch (error) {
    console.error("Download User Dashboard CSV Error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to download report.",

      error: error.message,
    });
  }
};

export {
  getAllUserLoginLogs,
  getUserLoginAndAssignmentDetails,
  getUserEfficiency,
  getUserPassFailSummary,
  getUserAttendance,
  getQuestionAttemptAnalysis,
  getSubjectAverageMarks,
  getEvaluatorAverageMarks,
  downloadSingleUserDataCsv,
  getUserDataByDateRange,
  downloadUserDataByDateRangeCsv,
};
