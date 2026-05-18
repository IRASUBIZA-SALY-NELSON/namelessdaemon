package com.chat.app.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.config.EnableMongoAuditing;

@Configuration
@EnableMongoAuditing
public class MongoDBConfig {

    // Enables MongoDB auditing capabilities
    // We're manually setting timestamps in the service layer
}
