package com.chat.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableMongoRepositories(basePackages = "com.chat.app.repository")
@EnableScheduling
public class ChatApplication {

    public static void main(String[] args) {
        // Render injects PORT — make sure Spring picks it up
        String port = System.getenv("PORT");
        if (port != null && !port.isBlank()) {
            System.setProperty("server.port", port);
        }
        SpringApplication.run(ChatApplication.class, args);
    }

}
