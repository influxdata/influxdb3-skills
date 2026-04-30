package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/InfluxCommunity/influxdb3-go/v2/influxdb3"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	host := mustEnv("INFLUXDB_HOST")
	token := mustEnv("INFLUXDB_TOKEN")
	database := mustEnv("INFLUXDB_DATABASE")

	client, err := influxdb3.New(influxdb3.ClientConfig{
		Host:     host,
		Token:    token,
		Database: database,
	})
	if err != nil {
		log.Fatalf("client init: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	now := time.Now()

	points := make([]*influxdb3.Point, 0, 10)
	for i := 0; i < 10; i++ {
		ts := now.Add(time.Duration(-(10 - i)) * time.Minute)
		p := influxdb3.NewPointWithMeasurement("sensor").
			SetTag("host", "server01").
			SetTag("region", "us-west").
			SetField("temperature", 70.0+float64(i)*0.3).
			SetField("humidity", 40.0+float64(i)*0.5).
			SetTimestamp(ts)
		points = append(points, p)
	}

	fmt.Printf("==> Writing %d points to %s on %s\n", len(points), database, host)
	if err := client.WritePoints(ctx, points); err != nil {
		log.Fatalf("write: %v", err)
	}

	fmt.Println("==> Querying last 10 rows back")
	iter, err := client.Query(ctx, "SELECT * FROM sensor ORDER BY time DESC LIMIT 10")
	if err != nil {
		log.Fatalf("query: %v", err)
	}
	for iter.Next() {
		fmt.Println(iter.Value())
	}
	if err := iter.Err(); err != nil {
		log.Fatalf("iterate: %v", err)
	}
	fmt.Println("==> Done")
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("missing env var %s", k)
	}
	return v
}
