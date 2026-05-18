package com.chat.app.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.config.AbstractMongoClientConfiguration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@Configuration
@EnableMongoRepositories(basePackages = "com.chat.app.repository")
public class MongoConfig extends AbstractMongoClientConfiguration {

    private static final String ATLAS_URI =
        "mongodb+srv://taskmanager:taskmanager@tasks.so4z3xg.mongodb.net/tasks" +
        "?retryWrites=true&w=majority&appName=tasks";

    @Override
    protected String getDatabaseName() {
        return "tasks";
    }

    @Override
    @Bean
    public MongoClient mongoClient() {
        MongoClientSettings settings = MongoClientSettings.builder()
            .applyConnectionString(new ConnectionString(ATLAS_URI))
            .build();
        return MongoClients.create(settings);
    }
}
