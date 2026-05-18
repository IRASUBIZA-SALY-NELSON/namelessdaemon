package com.chat.app.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;
import jakarta.mail.MessagingException;

import com.chat.app.model.Task;
import com.chat.app.repository.TaskRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final TaskRepository taskRepository;

    @Value("${spring.mail.username}")
    private String fromEmail;

    @Value("${app.notification.email:irasubizasalynelson@gmail.com}")
    private String notificationEmail;

    // Track sent notifications to prevent duplicates
    private final Set<String> sentNotifications = ConcurrentHashMap.newKeySet();

    // Clear old notification keys periodically (every hour)
    @Scheduled(fixedRate = 3600000) // Every hour
    public void clearOldNotifications() {
        // Clear notifications older than 24 hours to prevent memory buildup
        sentNotifications.clear();
    }

    @Async
    public void sendTaskReminder(Task task, String timeFrame) {
        String notificationKey = task.getId() + "-" + timeFrame;

        // Check if already sent
        if (sentNotifications.contains(notificationKey)) {
            return;
        }

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(notificationEmail);
            helper.setSubject(getReminderSubject(task, timeFrame));
            helper.setText(getStyledReminderBody(task, timeFrame), true);

            mailSender.send(mimeMessage);
            sentNotifications.add(notificationKey);
        } catch (MessagingException e) {
            throw new RuntimeException("Failed to send email", e);
        }
    }

    @Scheduled(fixedRate = 60000) // Check every minute to reduce spam
    public void checkForReminders() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime fiveMinutesFromNow = now.plusMinutes(5);
        LocalDateTime oneDayFromNow = now.plusDays(1);
        LocalDateTime oneHourFromNow = now.plusHours(1);

        // Check for tasks due in 5 minutes (smaller window)
        List<Task> tasksInFiveMinutes = taskRepository.findByDueDateBetweenAndStatusNot(
                fiveMinutesFromNow.minusSeconds(30), // 30 second window
                fiveMinutesFromNow.plusSeconds(30),
                "DONE");

        // Check for tasks due in 1 hour (smaller window)
        List<Task> tasksInOneHour = taskRepository.findByDueDateBetweenAndStatusNot(
                oneHourFromNow.minusMinutes(2), // 2 minute window
                oneHourFromNow.plusMinutes(2),
                "DONE");

        // Check for tasks due in 1 day (much smaller window)
        List<Task> tasksInOneDay = taskRepository.findByDueDateBetweenAndStatusNot(
                oneDayFromNow.minusMinutes(5), // 5 minute window
                oneDayFromNow.plusMinutes(5),
                "DONE");

        // Only send next task notification if it's due soon (within 2 hours)
        List<Task> nextTasks = taskRepository.findByDueDateBetweenAndStatusNotOrderByDueDateAsc(
                now, now.plusHours(2), "DONE");

        // Send notifications with better tracking
        tasksInFiveMinutes.forEach(task -> sendTaskReminder(task, "5 minutes"));
        tasksInOneHour.forEach(task -> sendTaskReminder(task, "1 hour"));
        tasksInOneDay.forEach(task -> sendTaskReminder(task, "1 day"));

        // Send next task notification only if it's urgent
        if (!nextTasks.isEmpty()) {
            Task nextTask = nextTasks.get(0);
            // Only send next task notification if it's due within 30 minutes
            if (nextTask.getDueDate().isBefore(now.plusMinutes(30))) {
                sendNextTaskNotification(nextTask);
            }
        }
    }

    private String getReminderSubject(Task task, String timeFrame) {
        return String.format("Task Reminder: %s due in %s", task.getTitle(), timeFrame);
    }

    private String getNextTaskSubject(Task task) {
        return String.format("NEXT TASK: %s", task.getTitle());
    }

    @Async
    public void sendNextTaskNotification(Task task) {
        String notificationKey = task.getId() + "-next";

        // Check if already sent
        if (sentNotifications.contains(notificationKey)) {
            return;
        }

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(notificationEmail);
            helper.setSubject(getNextTaskSubject(task));
            helper.setText(getStyledNextTaskBody(task), true);

            mailSender.send(mimeMessage);
            sentNotifications.add(notificationKey);
        } catch (MessagingException e) {
            throw new RuntimeException("Failed to send email", e);
        }
    }

    private String getNextTaskBody(Task task) {
        StringBuilder body = new StringBuilder();
        body.append("Hello!\n\n");
        body.append("Your next task is ready for you:\n\n");
        body.append(String.format("NEXT TASK: %s\n", task.getTitle()));

        if (task.getDescription() != null && !task.getDescription().trim().isEmpty()) {
            body.append(String.format("Description: %s\n", task.getDescription()));
        }

        body.append(String.format("Priority: %s\n", task.getPriority()));
        body.append(String.format("Due: %s\n",
                task.getDueDate().format(java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a"))));

        body.append("\nTime to focus on what's next! You've got this!");
        body.append("\n\nBest regards,\nTasks Manager");

        return body.toString();
    }

    private String getReminderBody(Task task, String timeFrame) {
        StringBuilder body = new StringBuilder();
        body.append("Hello!\n\n");
        body.append(String.format("This is a friendly reminder that your task is due in %s:\n\n", timeFrame));

        body.append(String.format("Task: %s\n", task.getTitle()));

        if (task.getDescription() != null && !task.getDescription().trim().isEmpty()) {
            body.append(String.format("Description: %s\n", task.getDescription()));
        }

        body.append(String.format("Priority: %s\n", task.getPriority()));
        body.append(String.format("Due Date: %s\n",
                task.getDueDate().format(java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a"))));

        if ("5 minutes".equals(timeFrame)) {
            body.append("\nIt's time to get started! You've got this!");
        } else if ("1 hour".equals(timeFrame)) {
            body.append("\nOne hour remaining! Time to focus!");
        } else {
            body.append("\nPlan your time wisely to complete this task tomorrow.");
        }

        body.append("\n\nBest regards,\nTasks Manager");

        return body.toString();
    }

    @Async
    public void sendTaskCompletedNotification(Task task) {
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(notificationEmail);
            helper.setSubject("Task Completed: " + task.getTitle());
            helper.setText(getStyledCompletionBody(task), true);

            mailSender.send(mimeMessage);
        } catch (Exception e) {
            // Log error but don't throw to avoid breaking the flow
            System.err.println("Failed to send completion notification: " + e.getMessage());
        }
    }

    private String getCompletionBody(Task task) {
        StringBuilder body = new StringBuilder();
        body.append("Congratulations!\n\n");
        body.append("You've successfully completed:\n\n");
        body.append(String.format("Task: %s\n", task.getTitle()));

        if (task.getDescription() != null && !task.getDescription().trim().isEmpty()) {
            body.append(String.format("Description: %s\n", task.getDescription()));
        }

        body.append(String.format("Priority: %s\n", task.getPriority()));
        body.append(String.format("Completed at: %s\n",
                java.time.LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a"))));

        body.append("\nGreat job! Keep up excellent work!");
        body.append("\n\nBest regards,\nTasks Manager");

        return body.toString();
    }

    private String getStyledReminderBody(Task task, String timeFrame) {
        String priorityColor = getPriorityColor(task.getPriority());
        String urgencyColor = getUrgencyColor(timeFrame);

        return String.format("""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Task Reminder</title>
                    <style>
                        body {
                            background-color: #FFFFFF;
                            color: #1F2937;
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            margin: 0;
                            padding: 20px;
                            line-height: 1.6;
                        }
                        .container {
                            width: 100%%;
                            background-color: #FFFFFF;
                            border: 1px solid #E5E7EB;
                            border-radius: 12px;
                            padding: 32px;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 32px;
                        }
                        .logo {
                            font-size: 24px;
                            font-weight: 800;
                            color: #2563eb;
                            margin-bottom: 8px;
                        }
                        .reminder-badge {
                            display: inline-block;
                            background-color: %s;
                            color: #FFFFFF;
                            padding: 6px 16px;
                            border-radius: 20px;
                            font-size: 14px;
                            font-weight: 600;
                            margin-bottom: 24px;
                        }
                        .task-card {
                            background-color: #F9FAFB;
                            border: 1px solid #E5E7EB;
                            border-radius: 8px;
                            padding: 24px;
                            margin-bottom: 24px;
                        }
                        .task-title {
                            font-size: 20px;
                            font-weight: 700;
                            color: #1F2937;
                            margin-bottom: 16px;
                        }
                        .task-details {
                            margin-bottom: 20px;
                        }
                        .detail-row {
                            display: flex;
                            align-items: center;
                            margin-bottom: 12px;
                        }
                        .detail-label {
                            font-weight: 600;
                            color: #6B7280;
                            width: 100px;
                            font-size: 14px;
                        }
                        .detail-value {
                            color: #1F2937;
                            font-size: 14px;
                        }
                        .priority-badge {
                            display: inline-block;
                            padding: 4px 12px;
                            border-radius: 12px;
                            font-size: 12px;
                            font-weight: 600;
                            color: #FFFFFF;
                            background-color: %s;
                        }
                        .message {
                            background-color: %s;
                            border-left: 4px solid %s;
                            padding: 16px;
                            border-radius: 4px;
                            margin-bottom: 24px;
                            color: #FFFFFF;
                        }
                        .footer {
                            text-align: center;
                            color: #6B7280;
                            font-size: 14px;
                            margin-top: 32px;
                        }
                        .footer strong {
                            color: #2563eb;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="logo">Task Manager</div>
                            <div class="reminder-badge">Reminder: %s</div>
                        </div>

                        <div class="task-card">
                            <div class="task-title">%s</div>

                            <div class="task-details">
                                <div class="detail-row">
                                    <span class="detail-label">Priority:</span>
                                    <span class="detail-value">
                                        <span class="priority-badge">%s</span>
                                    </span>
                                </div>

                                <div class="detail-row">
                                    <span class="detail-label">Due Date:</span>
                                    <span class="detail-value">%s</span>
                                </div>

                                %s
                            </div>
                        </div>

                        <div class="message">
                            %s
                        </div>

                        <div class="footer">
                            Best regards,<br>
                            <strong>Task Manager</strong> - Your Productivity Partner
                        </div>
                    </div>
                </body>
                </html>
                """,
                urgencyColor,
                priorityColor,
                urgencyColor,
                urgencyColor,
                timeFrame,
                task.getTitle(),
                task.getPriority(),
                task.getDueDate().format(java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a")),
                task.getDescription() != null && !task.getDescription().trim().isEmpty()
                        ? String.format(
                                "<div class=\"detail-row\"><span class=\"detail-label\">Description:</span><span class=\"detail-value\">%s</span></div>",
                                task.getDescription())
                        : "",
                getUrgencyMessage(timeFrame));
    }

    private String getStyledNextTaskBody(Task task) {
        String priorityColor = getPriorityColor(task.getPriority());

        return String.format("""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Next Task</title>
                    <style>
                        body {
                            background-color: #FFFFFF;
                            color: #1F2937;
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            margin: 0;
                            padding: 20px;
                            line-height: 1.6;
                        }
                        .container {
                            width: 100%%;
                            background-color: #FFFFFF;
                            border: 1px solid #E5E7EB;
                            border-radius: 12px;
                            padding: 32px;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 32px;
                        }
                        .logo {
                            font-size: 24px;
                            font-weight: 800;
                            color: #2563eb;
                            margin-bottom: 8px;
                        }
                        .next-badge {
                            display: inline-block;
                            background-color: #2563eb;
                            color: #FFFFFF;
                            padding: 8px 20px;
                            border-radius: 20px;
                            font-size: 16px;
                            font-weight: 700;
                            margin-bottom: 24px;
                        }
                        .task-card {
                            background-color: #F9FAFB;
                            border: 1px solid #E5E7EB;
                            border-radius: 8px;
                            padding: 24px;
                            margin-bottom: 24px;
                            border-left: 4px solid #2563eb;
                        }
                        .task-title {
                            font-size: 22px;
                            font-weight: 700;
                            color: #1F2937;
                            margin-bottom: 20px;
                        }
                        .task-details {
                            margin-bottom: 24px;
                        }
                        .detail-row {
                            display: flex;
                            align-items: center;
                            margin-bottom: 12px;
                        }
                        .detail-label {
                            font-weight: 600;
                            color: #6B7280;
                            width: 100px;
                            font-size: 14px;
                        }
                        .detail-value {
                            color: #1F2937;
                            font-size: 14px;
                        }
                        .priority-badge {
                            display: inline-block;
                            padding: 4px 12px;
                            border-radius: 12px;
                            font-size: 12px;
                            font-weight: 600;
                            color: #FFFFFF;
                            background-color: %s;
                        }
                        .focus-message {
                            background-color: #EFF6FF;
                            border-left: 4px solid #2563eb;
                            padding: 20px;
                            border-radius: 4px;
                            margin-bottom: 24px;
                            text-align: center;
                            color: #1E40AF;
                        }
                        .focus-message h3 {
                            color: #2563eb;
                            margin-bottom: 8px;
                            font-size: 18px;
                        }
                        .footer {
                            text-align: center;
                            color: #6B7280;
                            font-size: 14px;
                            margin-top: 32px;
                        }
                        .footer strong {
                            color: #2563eb;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="logo">Task Manager</div>
                            <div class="next-badge">NEXT TASK</div>
                        </div>

                        <div class="task-card">
                            <div class="task-title">%s</div>

                            <div class="task-details">
                                <div class="detail-row">
                                    <span class="detail-label">Priority:</span>
                                    <span class="detail-value">
                                        <span class="priority-badge">%s</span>
                                    </span>
                                </div>

                                <div class="detail-row">
                                    <span class="detail-label">Due Date:</span>
                                    <span class="detail-value">%s</span>
                                </div>

                                %s
                            </div>
                        </div>

                        <div class="focus-message">
                            <h3>Time to Focus!</h3>
                            <p>Your next task is ready. Let's get this done!</p>
                        </div>

                        <div class="footer">
                            Best regards,<br>
                            <strong>Task Manager</strong> - Your Productivity Partner
                        </div>
                    </div>
                </body>
                </html>
                """,
                priorityColor,
                task.getTitle(),
                task.getPriority(),
                task.getDueDate().format(java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a")),
                task.getDescription() != null && !task.getDescription().trim().isEmpty()
                        ? String.format(
                                "<div class=\"detail-row\"><span class=\"detail-label\">Description:</span><span class=\"detail-value\">%s</span></div>",
                                task.getDescription())
                        : "");
    }

    private String getPriorityColor(String priority) {
        switch (priority.toUpperCase()) {
            case "HIGH":
                return "#dc2626";
            case "MEDIUM":
                return "#2563eb";
            case "LOW":
                return "#16a34a";
            default:
                return "#64748b";
        }
    }

    private String getUrgencyColor(String timeFrame) {
        switch (timeFrame) {
            case "5 minutes":
                return "#dc2626";
            case "1 hour":
                return "#f59e0b";
            case "1 day":
                return "#2563eb";
            default:
                return "#64748b";
        }
    }

    private String getUrgencyMessage(String timeFrame) {
        switch (timeFrame) {
            case "5 minutes":
                return "It's time to get started! This task is due in 5 minutes.";
            case "1 hour":
                return "One hour remaining! Time to focus and complete this task.";
            case "1 day":
                return "Plan your time wisely to complete this task tomorrow.";
            default:
                return "This task needs your attention.";
        }
    }

    private String getStyledCompletionBody(Task task) {
        String priorityColor = getPriorityColor(task.getPriority());

        return String.format(
                """
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Task Completed</title>
                            <style>
                                body {
                                    background-color: #FFFFFF;
                                    color: #1F2937;
                                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                                    margin: 0;
                                    padding: 20px;
                                    line-height: 1.6;
                                }
                                .container {
                                    width: 100%%;
                                    background-color: #FFFFFF;
                                    border: 1px solid #E5E7EB;
                                    border-radius: 12px;
                                    padding: 32px;
                                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                                }
                                .header {
                                    text-align: center;
                                    margin-bottom: 32px;
                                }
                                .logo {
                                    font-size: 24px;
                                    font-weight: 800;
                                    color: #2563eb;
                                    margin-bottom: 8px;
                                }
                                .title {
                                    font-size: 28px;
                                    font-weight: 700;
                                    color: #1F2937;
                                    margin-bottom: 8px;
                                }
                                .subtitle {
                                    color: #6B7280;
                                    font-size: 16px;
                                }
                                .task-card {
                                    background-color: #F9FAFB;
                                    border: 1px solid #E5E7EB;
                                    border-radius: 8px;
                                    padding: 24px;
                                    margin: 24px 0;
                                }
                                .task-title {
                                    font-size: 20px;
                                    font-weight: 600;
                                    color: #1F2937;
                                    margin-bottom: 12px;
                                }
                                .task-description {
                                    color: #6B7280;
                                    margin-bottom: 16px;
                                    line-height: 1.5;
                                }
                                .task-details {
                                    display: grid;
                                    grid-template-columns: 1fr 1fr;
                                    gap: 16px;
                                }
                                .detail-item {
                                    display: flex;
                                    flex-direction: column;
                                }
                                .detail-label {
                                    font-size: 12px;
                                    font-weight: 600;
                                    color: #6B7280;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                    margin-bottom: 4px;
                                }
                                .detail-value {
                                    font-size: 14px;
                                    color: #1F2937;
                                    font-weight: 500;
                                }
                                .priority-badge {
                                    display: inline-block;
                                    padding: 4px 12px;
                                    border-radius: 20px;
                                    font-size: 12px;
                                    font-weight: 600;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                }
                                .completion-message {
                                    background-color: #ECFDF5;
                                    border: 1px solid #10B981;
                                    border-radius: 8px;
                                    padding: 20px;
                                    text-align: center;
                                    margin: 24px 0;
                                }
                                .completion-message h3 {
                                    color: #059669;
                                    font-size: 18px;
                                    font-weight: 600;
                                    margin: 0 0 8px 0;
                                }
                                .completion-message p {
                                    color: #047857;
                                    margin: 0;
                                }
                                .footer {
                                    text-align: center;
                                    margin-top: 32px;
                                    padding-top: 24px;
                                    border-top: 1px solid #E5E7EB;
                                    color: #6B7280;
                                    font-size: 14px;
                                }
                                .emoji {
                                    font-size: 48px;
                                    margin-bottom: 16px;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="header">
                                    <div class="emoji">%s</div>
                                    <div class="logo">Saly Nelson Task Manager</div>
                                    <h1 class="title">Task Completed!</h1>
                                    <p class="subtitle">Congratulations on your achievement</p>
                                </div>

                                <div class="completion-message">
                                    <h3>Great Job! Well Done!</h3>
                                    <p>You've successfully completed another task. Keep up the excellent work!</p>
                                </div>

                                <div class="task-card">
                                    <h2 class="task-title">%s</h2>
                                    %s
                                    <div class="task-details">
                                        <div class="detail-item">
                                            <span class="detail-label">Priority</span>
                                            <span class="detail-value">
                                                <span class="priority-badge" style="background-color: %s20; color: %s; border: 1px solid %s;">
                                                    %s
                                                </span>
                                            </span>
                                        </div>
                                        <div class="detail-item">
                                            <span class="detail-label">Completed At</span>
                                            <span class="detail-value">%s</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="footer">
                                    <p>Saly Nelson © 2026</p>
                                    <p style="font-size: 12px; margin-top: 8px;">
                                        This email was sent from your Task Manager application
                                    </p>
                                </div>
                            </div>
                        </body>
                        </html>
                        """,
                task.getTitle(),
                (task.getDescription() != null && !task.getDescription().trim().isEmpty())
                        ? String.format("<p class=\"task-description\">%s</p>", task.getDescription())
                        : "",
                priorityColor, priorityColor, priorityColor,
                task.getPriority(),
                java.time.LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a")));
    }

    @Async
    public void sendEmail(String to, String subject, String body) {
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(body, true);

            mailSender.send(mimeMessage);
        } catch (Exception e) {
            System.err.println("Failed to send email: " + e.getMessage());
        }
    }

    // Test method to send sample email
    @Async
    public void sendTestEmail() {
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(notificationEmail);
            helper.setSubject("Styled Email Test - Task Manager");
            helper.setText(getStyledTestEmailBody(), true);

            mailSender.send(mimeMessage);
        } catch (MessagingException e) {
            throw new RuntimeException("Failed to send test email", e);
        }
    }

    private String getStyledTestEmailBody() {
        return """
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Styled Email Test</title>
                    <style>
                        body {
                            background-color: #FFFFFF;
                            color: #1F2937;
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            margin: 0;
                            padding: 20px;
                            line-height: 1.6;
                        }
                        .container {
                            width: 100%%;
                            background-color: #FFFFFF;
                            border: 1px solid #E5E7EB;
                            border-radius: 12px;
                            padding: 32px;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 32px;
                        }
                        .logo {
                            font-size: 24px;
                            font-weight: 800;
                            color: #2563eb;
                            margin-bottom: 8px;
                        }
                        .test-badge {
                            display: inline-block;
                            background-color: #2563eb;
                            color: #FFFFFF;
                            padding: 8px 20px;
                            border-radius: 20px;
                            font-size: 16px;
                            font-weight: 700;
                            margin-bottom: 24px;
                        }
                        .section {
                            background-color: #F9FAFB;
                            border: 1px solid #E5E7EB;
                            border-radius: 8px;
                            padding: 24px;
                            margin-bottom: 24px;
                        }
                        .section-title {
                            font-size: 18px;
                            font-weight: 700;
                            color: #2563eb;
                            margin-bottom: 16px;
                        }
                        .feature-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 16px;
                            margin-bottom: 20px;
                        }
                        .feature-item {
                            background-color: #FFFFFF;
                            padding: 16px;
                            border-radius: 6px;
                            border: 1px solid #E5E7EB;
                        }
                        .feature-title {
                            font-weight: 600;
                            color: #1F2937;
                            margin-bottom: 8px;
                        }
                        .feature-desc {
                            color: #6B7280;
                            font-size: 14px;
                        }
                        .priority-demo {
                            display: flex;
                            gap: 8px;
                            margin-top: 12px;
                        }
                        .priority-badge {
                            padding: 4px 12px;
                            border-radius: 12px;
                            font-size: 12px;
                            font-weight: 600;
                            color: #FFFFFF;
                        }
                        .high { background-color: #dc2626; }
                        .medium { background-color: #2563eb; }
                        .low { background-color: #16a34a; }
                        .footer {
                            text-align: center;
                            color: #6B7280;
                            font-size: 14px;
                            margin-top: 32px;
                        }
                        .footer strong {
                            color: #2563eb;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="logo">Task Manager</div>
                            <div class="test-badge">EMAIL STYLE TEST</div>
                        </div>

                        <div class="section">
                            <div class="section-title">Beautiful White Theme Emails</div>
                            <p>Your emails now feature a clean white theme that's easy to read and professional!</p>

                            <div class="feature-grid">
                                <div class="feature-item">
                                    <div class="feature-title">Clean White Background</div>
                                    <div class="feature-desc">#FFFFFF background for maximum readability</div>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-title">Light Gray Cards</div>
                                    <div class="feature-desc">#F9FAFB cards with subtle borders</div>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-title">Dark Gray Text</div>
                                    <div class="feature-desc">#1F2937 text for perfect contrast</div>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-title">Your Blue Accent</div>
                                    <div class="feature-desc">#2563eb for branding consistency</div>
                                </div>
                            </div>
                        </div>

                        <div class="section">
                            <div class="section-title">Priority Color System</div>
                            <p>Tasks are color-coded by priority with meaningful colors:</p>
                            <div class="priority-demo">
                                <span class="priority-badge high">HIGH</span>
                                <span class="priority-badge medium">MEDIUM</span>
                                <span class="priority-badge low">LOW</span>
                            </div>
                        </div>

                        <div class="section">
                            <div class="section-title">Professional Email Features</div>
                            <ul style="color: #6B7280; line-height: 1.8;">
                                <li>No duplicate email sending</li>
                                <li>Clean, responsive HTML design</li>
                                <li>Full-width layout (no width limitations)</li>
                                <li>Professional typography with Inter font</li>
                                <li>Contextual urgency messages</li>
                                <li>Task details with proper formatting</li>
                            </ul>
                        </div>

                        <div class="footer">
                            <strong>Task Manager</strong> - Your Productivity Partner<br>
                            Beautiful emails with full width layout!
                        </div>
                    </div>
                </body>
                </html>
                """;
    }
}
